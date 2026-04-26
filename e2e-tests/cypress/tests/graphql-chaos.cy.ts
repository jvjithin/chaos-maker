const GQL_URL_PATTERN = '127.0.0.1:8083/graphql';

describe('GraphQL operation matching', () => {
  it('fails only the matching operation; others pass through', () => {
    cy.injectChaos({
      network: {
        failures: [{
          urlPattern: GQL_URL_PATTERN,
          statusCode: 503,
          probability: 1,
          graphqlOperation: 'GetUser',
        }],
      },
    });
    cy.visit('/');
    cy.get('#gql-get-user').click();
    cy.get('#gql-status').should('contain', '503');

    cy.get('#gql-search-products').click();
    cy.get('#gql-status').should('contain', '200');
    cy.get('#gql-result').should('contain', 'Gizmo');

    cy.getChaosLog().then((log) => {
      const failures = log.filter((e) => e.type === 'network:failure' && e.applied);
      expect(failures).to.have.length(1);
      expect(failures[0].detail.operationName).to.equal('GetUser');
    });
  });

  it('combines urlPattern + methods + graphqlOperation as AND filters', () => {
    cy.injectChaos({
      network: {
        failures: [{
          urlPattern: GQL_URL_PATTERN,
          methods: ['POST'],
          statusCode: 401,
          probability: 1,
          graphqlOperation: 'GetUser',
        }],
      },
    });
    cy.visit('/');
    cy.get('#gql-get-user').click();
    cy.get('#gql-status').should('contain', '401');
    // GET persisted-query path skips because methods only includes POST.
    cy.get('#gql-persisted-get').click();
    cy.get('#gql-status').should('contain', '200');
  });

  it('persisted-query GET ?operationName= matches when methods is [GET]', () => {
    cy.injectChaos({
      network: {
        failures: [{
          urlPattern: GQL_URL_PATTERN,
          methods: ['GET'],
          statusCode: 504,
          probability: 1,
          graphqlOperation: 'GetUser',
        }],
      },
    });
    cy.visit('/');
    cy.get('#gql-persisted-get').click();
    cy.get('#gql-status').should('contain', '504');
    cy.getChaosLog().then((log) => {
      const failures = log.filter((e) => e.type === 'network:failure' && e.applied);
      expect(failures.length).to.equal(1);
      expect(failures[0].detail.operationName).to.equal('GetUser');
    });
  });

  it('multipart upload emits a graphql-body-unparseable diagnostic and does not chaos', () => {
    cy.injectChaos({
      network: {
        failures: [{
          urlPattern: GQL_URL_PATTERN,
          statusCode: 599,
          probability: 1,
          graphqlOperation: 'CreatePost',
        }],
      },
    });
    cy.visit('/');
    cy.get('#gql-multipart').click();
    // Server returns 400 (fixture isn't a real multipart impl); test only
    // cares that chaos's 599 was NOT injected over the real response.
    cy.get('#gql-status').should(($el) => {
      expect($el.text()).not.to.contain('599');
    });
    cy.getChaosLog().then((log) => {
      const diag = log.find((e) => e.detail.reason === 'graphql-body-unparseable');
      expect(diag, 'graphql-body-unparseable diagnostic').to.exist;
      expect(diag!.applied).to.equal(false);
      expect(diag!.type).to.equal('network:failure');
    });
  });

  it('skips an anonymous query when matcher is set', () => {
    cy.injectChaos({
      network: {
        failures: [{
          urlPattern: GQL_URL_PATTERN,
          statusCode: 500,
          probability: 1,
          graphqlOperation: 'GetUser',
        }],
      },
    });
    cy.visit('/');
    cy.get('#gql-anonymous').click();
    cy.get('#gql-status').should('contain', '200');
  });

  it('XHR POST GraphQL matches by operationName', () => {
    cy.injectChaos({
      network: {
        failures: [{
          urlPattern: GQL_URL_PATTERN,
          statusCode: 503,
          probability: 1,
          graphqlOperation: 'GetUser',
        }],
      },
    });
    cy.visit('/');
    cy.get('#gql-xhr-get-user').click();
    cy.get('#gql-status').should('contain', '503');
    cy.getChaosLog().then((log) => {
      const failures = log.filter((e) => e.type === 'network:failure' && e.applied);
      expect(failures.length).to.be.greaterThan(0);
      expect(failures[0].detail.operationName).to.equal('GetUser');
    });
  });
});
