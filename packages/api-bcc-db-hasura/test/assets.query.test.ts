/* eslint-disable camelcase */
import path from 'path'

import { DocumentNode } from 'graphql'
import util from '@bcc-graphql/util'
import { TestClient } from '@bcc-graphql/util-dev'
import { testClient } from './util'

function loadQueryNode (name: string): Promise<DocumentNode> {
  return util.loadQueryNode(path.resolve(__dirname, '..', 'src', 'example_queries', 'assets'), name)
}

describe('assets', () => {
  let client: TestClient
  beforeAll(async () => {
    client = await testClient.mainnet()
  })

  it('can return information on assets', async () => {
    const result = await client.query({
      query: await loadQueryNode('assets'),
      variables: {
        limit: 2
      }
    })
    const { assets_aggregate, assets } = result.data
    const { aggregate } = assets_aggregate
    expect(aggregate.count).toBeDefined()
    expect(assets.length).toBeGreaterThan(0)
    expect(assets[0].tokenMints.length).toBeGreaterThan(0)
    expect(parseInt(assets[0].tokenMints_aggregate.aggregate.count)).toBeGreaterThan(0)
    expect(assets[0].fingerprint.slice(0, 5)).toBe('asset')
  })

  it('can return information on assets by fingerprint', async () => {
    const result = await client.query({
      query: await loadQueryNode('assets'),
      variables: {
        where: {
          _and: [{
            fingerprint: { _eq: 'asset12h3p5l3nd5y26lr22am7y7ga3vxghkhf57zkhd' },
            tokenMints: { transaction: { includedAt: { _gt: '2017-09-23T21:44:51Z' } } }
          }]
        }
      }
    })
    const { assets } = result.data
    expect(assets[0].assetId).toBeDefined()
    expect(assets[0].assetName).toBeDefined()
    expect(assets[0].description).toBeDefined()
    expect(assets[0].fingerprint).toBeDefined()
    expect(assets[0].logo).toBeDefined()
    expect(assets[0].name).toBeDefined()
    expect(assets[0].policyId).toBeDefined()
    expect(assets[0].ticker).toBeDefined()
    expect(assets[0].url).toBeDefined()
  })
  it('can return information on assets by assetId', async () => {
    const result = await client.query({
      query: await loadQueryNode('assets'),
      variables: {
        where: {
          _and: [{
            assetId: { _eq: 'e694218542123b5def28de396199f1c5d32bdd54f031a8dd85e4aa2141474958' }
          }]
        }
      }
    })
    const { assets } = result.data
    expect(assets[0].assetName).toBe('41474958')
    expect(assets[0].decimals).toBe(8)
    expect(assets[0].description).toBe('Decentralized Marketplace for Artificial Intelligence')
    expect(assets[0].fingerprint).toBe('asset1d2f78x4z827vqvs02yn3m5zgzl9v8hgucycvyx')
    expect(assets[0].logo).toBe('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')
    expect(assets[0].name).toBe('SingularityNET Token')
    expect(assets[0].policyId).toBe('e694218542123b5def28de396199f1c5d32bdd54f031a8dd85e4aa21')
    expect(assets[0].ticker).toBe('AGIX')
    expect(assets[0].url).toBe('https://singularitynet.io')
  })
})
