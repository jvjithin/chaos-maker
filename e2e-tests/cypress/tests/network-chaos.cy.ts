const API_PATTERN = '/api/data.json';

// ---------------------------------------------------------------------------
// Network Failures
// ---------------------------------------------------------------------------
describe('Network Failures', () => {
  it('injects failure with 503 status', () => {
    cy.injectChaos({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Error!');
    cy.get('#result').should('contain', '503');
    cy.getChaosLog().then((log) => {
      expect(log.some((e) => e.type === 'network:failure' && e.applied)).to.be.true;
    });
  });

  it('injects failure with custom body and status text', () => {
    cy.injectChaos({
      network: {
        failures: [{
          urlPattern: API_PATTERN,
          statusCode: 429,
          probability: 1.0,
          body: '{"error":"rate limited"}',
          statusText: 'Too Many Requests',
        }],
      },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Error!');
    cy.get('#result').should('contain', '429');
  });

  it('passes through when probability is 0', () => {
    cy.injectChaos({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 0 }] },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Success!');
  });

  it('applies failure only to matching HTTP methods', () => {
    cy.injectChaos({
      network: {
        failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0, methods: ['POST'] }],
      },
    });
    cy.visit('/');
    // GET passes through
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Success!');
    // POST fails
    cy.get('#fetch-post').click();
    cy.get('#status').should('have.text', 'Error!');
    cy.get('#result').should('contain', '500');
  });

  it('does not affect non-matching URLs', () => {
    cy.injectChaos({
      network: { failures: [{ urlPattern: '/no-match', statusCode: 500, probability: 1.0 }] },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Success!');
  });

  it('injects failure on XHR requests', () => {
    cy.injectChaos({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 500, probability: 1.0 }] },
    });
    cy.visit('/');
    cy.get('#xhr-get').click();
    cy.get('#xhr-status').should('have.text', 'Error!');
    cy.get('#xhr-result').should('contain', '500');
  });
});

// ---------------------------------------------------------------------------
// Network Latency
// ---------------------------------------------------------------------------
describe('Network Latency', () => {
  it('adds delay to fetch requests', () => {
    const delayMs = 500;
    cy.injectChaos({
      network: { latencies: [{ urlPattern: API_PATTERN, delayMs, probability: 1.0 }] },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Success!');
    cy.get('#timing').invoke('text').then((txt) => {
      expect(parseInt(txt)).to.be.gte(delayMs - 100);
    });
  });

  it('logs latency event', () => {
    cy.injectChaos({
      network: { latencies: [{ urlPattern: API_PATTERN, delayMs: 100, probability: 1.0 }] },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Success!');
    cy.getChaosLog().then((log) => {
      const evt = log.find((e) => e.type === 'network:latency' && e.applied);
      expect(evt).to.exist;
      expect(evt!.detail).to.have.property('delayMs', 100);
    });
  });

  it('skips latency when probability is 0', () => {
    cy.injectChaos({
      network: { latencies: [{ urlPattern: API_PATTERN, delayMs: 2000, probability: 0 }] },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Success!');
    cy.get('#timing').invoke('text').then((txt) => {
      expect(parseInt(txt)).to.be.lt(1000);
    });
  });
});

// ---------------------------------------------------------------------------
// Connection Abort
// ---------------------------------------------------------------------------
describe('Connection Abort', () => {
  it('aborts fetch requests immediately', () => {
    cy.injectChaos({
      network: { aborts: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Error!');
    cy.get('#result').should('contain', 'aborted');
    cy.getChaosLog().then((log) => {
      expect(log.some((e) => e.type === 'network:abort' && e.applied)).to.be.true;
    });
  });

  it('aborts XHR requests', () => {
    cy.injectChaos({
      network: { aborts: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    cy.visit('/');
    cy.get('#xhr-get').click();
    cy.get('#xhr-status').should('have.text', 'Aborted!');
  });

  it('records timeout in abort event detail', () => {
    cy.injectChaos({
      network: { aborts: [{ urlPattern: API_PATTERN, probability: 1.0, timeout: 200 }] },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#timing').should('not.be.empty');
    cy.getChaosLog().then((log) => {
      const evt = log.find((e) => e.type === 'network:abort');
      expect(evt).to.exist;
      expect(evt!.detail.timeoutMs).to.equal(200);
    });
  });
});

// ---------------------------------------------------------------------------
// Response Corruption
// ---------------------------------------------------------------------------
describe('Response Corruption', () => {
  it('truncates response body', () => {
    cy.injectChaos({
      network: {
        corruptions: [{ urlPattern: API_PATTERN, strategy: 'truncate', probability: 1.0 }],
      },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Parse Error!');
    cy.get('#result').invoke('text').then((txt) => {
      expect(txt.length).to.be.greaterThan(0).and.lessThan(50);
    });
    cy.getChaosLog().then((log) => {
      expect(log.some((e) => e.type === 'network:corruption' && e.applied)).to.be.true;
    });
  });

  it('injects malformed JSON', () => {
    cy.injectChaos({
      network: {
        corruptions: [{ urlPattern: API_PATTERN, strategy: 'malformed-json', probability: 1.0 }],
      },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Parse Error!');
    cy.get('#result').should('contain', '"}');
  });

  it('replaces response with empty body', () => {
    cy.injectChaos({
      network: {
        corruptions: [{ urlPattern: API_PATTERN, strategy: 'empty', probability: 1.0 }],
      },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Parse Error!');
    cy.get('#result').should('have.text', '');
  });

  it('replaces response with unexpected HTML', () => {
    cy.injectChaos({
      network: {
        corruptions: [{ urlPattern: API_PATTERN, strategy: 'wrong-type', probability: 1.0 }],
      },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Parse Error!');
    cy.get('#result').should('contain', 'Unexpected HTML');
  });
});

// ---------------------------------------------------------------------------
// CORS Simulation
// ---------------------------------------------------------------------------
describe('CORS Simulation', () => {
  it('simulates CORS failure on fetch', () => {
    cy.injectChaos({
      network: { cors: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Error!');
    cy.get('#result').should('contain', 'Failed to fetch');
    cy.getChaosLog().then((log) => {
      expect(log.some((e) => e.type === 'network:cors' && e.applied)).to.be.true;
    });
  });

  it('simulates CORS failure on XHR', () => {
    cy.injectChaos({
      network: { cors: [{ urlPattern: API_PATTERN, probability: 1.0 }] },
    });
    cy.visit('/');
    cy.get('#xhr-get').click();
    cy.get('#xhr-status').should('have.text', 'Error!');
    cy.get('#xhr-result').should('contain', 'Network Error');
  });

  it('applies CORS only to matching methods', () => {
    cy.injectChaos({
      network: { cors: [{ urlPattern: API_PATTERN, probability: 1.0, methods: ['POST'] }] },
    });
    cy.visit('/');
    // GET passes through
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Success!');
    // POST blocked
    cy.get('#fetch-post').click();
    cy.get('#status').should('have.text', 'Error!');
    cy.get('#result').should('contain', 'Failed to fetch');
  });
});
