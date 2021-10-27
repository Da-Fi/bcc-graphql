import {
  ChainSyncClient,
  createChainSyncClient,
  isJenBlock,
  Schema
} from '@bcc-ogmios/client'
import pRetry from 'p-retry'
import { assetFingerprint } from './assetFingerprint'
import { Config } from './Config'
import util, { errors, RunnableModuleState } from '@bcc-graphql/util'
import { HasuraClient } from './HasuraClient'
import PgBoss from 'pg-boss'
import { dummyLogger, Logger } from 'ts-log'
import { isAurumBlock } from './util'

const MODULE_NAME = 'ChainFollower'

export class ChainFollower {
  private chainSyncClient: ChainSyncClient
  private queue: PgBoss
  private state: RunnableModuleState

  constructor (
    readonly hasuraClient: HasuraClient,
    private logger: Logger = dummyLogger,
    queueConfig: Config['db']
  ) {
    this.state = null
    this.queue = new PgBoss({
      application_name: 'bcc-graphql',
      ...queueConfig
    })
  }

  public async initialize (ogmiosConfig: Config['ogmios']) {
    if (this.state !== null) return
    this.state = 'initializing'
    this.logger.info({ module: MODULE_NAME }, 'Initializing')
    await pRetry(async () => {
      this.chainSyncClient = await createChainSyncClient({
        rollBackward: async ({ point, tip }, requestNext) => {
          if (point !== 'origin') {
            this.logger.info(
              { module: MODULE_NAME, tip, rollbackPoint: point }, 'Rolling back'
            )
            const deleteResult = await this.hasuraClient.deleteAssetsAfterSlot(point.slot)
            this.logger.info({ module: MODULE_NAME }, `Deleted ${deleteResult} assets`)
          } else {
            this.logger.info({ module: MODULE_NAME }, 'Rolling back to genesis')
            const deleteResult = await this.hasuraClient.deleteAssetsAfterSlot(0)
            this.logger.info({ module: MODULE_NAME }, `Deleted ${deleteResult} assets`)
          }
          requestNext()
        },
        rollForward: async ({ block }, requestNext) => {
          let b: Schema.BlockJen
          if (isAurumBlock(block)) {
            b = block.aurum  as Schema.BlockAurum
          } else if (isJenBlock(block)) {
            b = block.jen as Schema.BlockJen
          }
          if (b !== undefined) {
            for (const tx of b.body) {
              for (const entry of Object.entries(tx.body.mint.assets)) {
                const [policyId, assetName] = entry[0].split('.')
                const assetId = `${policyId}${assetName !== undefined ? assetName : ''}`
                if (!(await this.hasuraClient.hasAsset(assetId))) {
                  const asset = {
                    assetId,
                    assetName,
                    firstAppearedInSlot: b.header.slot,
                    fingerprint: assetFingerprint(policyId, assetName),
                    policyId
                  }
                  await this.hasuraClient.insertAssets([asset])
                  const SIX_HOURS = 21600
                  const THREE_MONTHS = 365
                  await this.queue.publish('asset-metadata-fetch-initial', { assetId }, {
                    retryDelay: SIX_HOURS,
                    retryLimit: THREE_MONTHS
                  })
                }
              }
            }
          }
          requestNext()
        }
      },
      this.logger.error,
      (code, reason) => {
        this.logger.error({ module: MODULE_NAME, code }, reason)
      },
      { connection: ogmiosConfig })
    }, {
      factor: 1.2,
      retries: 100,
      onFailedAttempt: util.onFailedAttemptFor(
        'Establishing connection to bcc-node chain-sync',
        this.logger
      )
    })
    this.state = 'initialized'
    this.logger.info({ module: MODULE_NAME }, 'Initialized')
  }

  public async start (points: Schema.Point[]) {
    if (this.state !== 'initialized') {
      throw new errors.ModuleIsNotInitialized(MODULE_NAME, 'start')
    }
    this.logger.info({ module: MODULE_NAME }, 'Starting')
    await this.queue.start()
    await this.chainSyncClient.startSync(points)
    this.logger.info({ module: MODULE_NAME }, 'Started')
  }

  public async shutdown () {
    if (this.state !== 'running') {
      throw new errors.ModuleIsNotInitialized(MODULE_NAME, 'shutdown')
    }
    this.logger.info({ module: MODULE_NAME }, 'Shutting down')
    await this.chainSyncClient.shutdown()
    await this.queue.stop()
    this.state = 'initialized'
    this.logger.info(
      { module: MODULE_NAME },
      'Shutdown complete')
  }
}
