import { browser, $ } from '@wdio/globals';
import type { ChaosEvent } from '@chaos-maker/core';

const GQL_PATTERN = '127.0.0.1:8083/graphql';

async function visitAndInject(config: Parameters<WebdriverIO.Browser['injectChaos']>[0]): Promise<void> {
  await browser.url('/');
  await browser.injectChaos(config);
}

async function fireGraphQLOp(buttonId: string): Promise<void> {
  await $(`#${buttonId}`).click();
  await browser.waitUntil(async () => {
    const status = await $('#gql-status').getText();
    return /^(ok |error |network-error|xhr ok |xhr error |xhr network-error)/.test(status);
  }, {
    timeout: 10_000,
    timeoutMsg: `${buttonId} did not finish`,
  });
}

async function gqlStatus(): Promise<string> {
  return $('#gql-status').getText();
}

describe('WDIO GraphQL operation matching', () => {
  it('fails only the matching operation and lets others pass through', async () => {
    await visitAndInject({
      network: {
        failures: [{
          urlPattern: GQL_PATTERN,
          statusCode: 503,
          probability: 1,
          graphqlOperation: 'GetUser',
        }],
      },
    });

    await fireGraphQLOp('gql-get-user');
    expect(await gqlStatus()).toContain('503');

    await fireGraphQLOp('gql-search-products');
    expect(await gqlStatus()).toContain('200');
    await expect($('#gql-result')).toHaveText(expect.stringContaining('Gizmo'));

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const failures = log.filter((e) => e.type === 'network:failure' && e.applied);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.detail.operationName).toBe('GetUser');
  });

  it('preserves RegExp graphqlOperation matchers across WDIO transport', async () => {
    await visitAndInject({
      network: {
        failures: [{
          urlPattern: GQL_PATTERN,
          statusCode: 502,
          probability: 1,
          graphqlOperation: /^Get/,
        }],
      },
    });

    await fireGraphQLOp('gql-get-user');
    expect(await gqlStatus()).toContain('502');

    await fireGraphQLOp('gql-create-post');
    expect(await gqlStatus()).toContain('200');
  });

  it('combines methods and graphqlOperation as AND filters', async () => {
    await visitAndInject({
      network: {
        failures: [{
          urlPattern: GQL_PATTERN,
          methods: ['POST'],
          statusCode: 401,
          probability: 1,
          graphqlOperation: 'GetUser',
        }],
      },
    });

    await fireGraphQLOp('gql-get-user');
    expect(await gqlStatus()).toContain('401');

    await fireGraphQLOp('gql-persisted-get');
    expect(await gqlStatus()).toContain('200');
  });

  it('matches persisted-query GET when methods includes GET', async () => {
    await visitAndInject({
      network: {
        failures: [{
          urlPattern: GQL_PATTERN,
          methods: ['GET'],
          statusCode: 504,
          probability: 1,
          graphqlOperation: 'GetUser',
        }],
      },
    });

    await fireGraphQLOp('gql-persisted-get');
    expect(await gqlStatus()).toContain('504');

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const failures = log.filter((e) => e.type === 'network:failure' && e.applied);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.detail.operationName).toBe('GetUser');
  });

  it('emits a graphql-body-unparseable diagnostic for multipart upload', async () => {
    await visitAndInject({
      network: {
        failures: [{
          urlPattern: GQL_PATTERN,
          statusCode: 599,
          probability: 1,
          graphqlOperation: 'CreatePost',
        }],
      },
    });

    await fireGraphQLOp('gql-multipart');
    expect(await gqlStatus()).not.toContain('599');

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const diagnostic = log.find((e) => e.detail.reason === 'graphql-body-unparseable');
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.applied).toBe(false);
    expect(diagnostic?.type).toBe('network:failure');
  });

  it('skips an anonymous query when a matcher is set', async () => {
    await visitAndInject({
      network: {
        failures: [{
          urlPattern: GQL_PATTERN,
          statusCode: 500,
          probability: 1,
          graphqlOperation: 'GetUser',
        }],
      },
    });

    await fireGraphQLOp('gql-anonymous');
    expect(await gqlStatus()).toContain('200');
  });

  it('matches XHR POST GraphQL requests by operationName', async () => {
    await visitAndInject({
      network: {
        failures: [{
          urlPattern: GQL_PATTERN,
          statusCode: 503,
          probability: 1,
          graphqlOperation: 'GetUser',
        }],
      },
    });

    await fireGraphQLOp('gql-xhr-get-user');
    expect(await gqlStatus()).toContain('503');

    const log = (await browser.getChaosLog()) as ChaosEvent[];
    const failures = log.filter((e) => e.type === 'network:failure' && e.applied);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]!.detail.operationName).toBe('GetUser');
  });
});
