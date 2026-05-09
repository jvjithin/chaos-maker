const API_PATTERN = '/api/data.json';

describe('Debug Mode', () => {
  it('mirrors a [Chaos] line to console.debug when debug:true', () => {
    cy.injectChaos({
      debug: true,
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    cy.visit('/', {
      onBeforeLoad(win) {
        cy.spy(win.console, 'debug').as('consoleDebug');
      },
    });
    cy.get('#fetch-data').click();
    cy.get('#result').should('contain', '503');
    cy.get('@consoleDebug').should('be.calledWithMatch', /^\[Chaos\] /);
  });

  it('emits a structured rule-applied debug event with ruleType + ruleId', () => {
    cy.injectChaos({
      debug: true,
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#result').should('contain', '503');
    cy.getChaosLog().then((log) => {
      const applied = log.find((e) => e.type === 'debug' && e.detail.stage === 'rule-applied');
      expect(applied).to.exist;
      expect(applied!.detail.ruleType).to.equal('failure');
      expect(applied!.detail.ruleId).to.equal('failure#0');
    });
  });

  it('emits no debug events when debug is omitted', () => {
    cy.injectChaos({
      network: { failures: [{ urlPattern: API_PATTERN, statusCode: 503, probability: 1.0 }] },
    });
    cy.visit('/', {
      onBeforeLoad(win) {
        cy.spy(win.console, 'debug').as('consoleDebug');
      },
    });
    cy.get('#fetch-data').click();
    cy.get('#result').should('contain', '503');
    cy.getChaosLog().then((log) => {
      expect(log.some((e) => e.type === 'debug')).to.be.false;
    });
    cy.get('@consoleDebug').then((spy) => {
      const stub = spy as unknown as { args: unknown[][] };
      const chaosLines = stub.args.filter(
        (a) => typeof a[0] === 'string' && (a[0] as string).startsWith('[Chaos] '),
      );
      expect(chaosLines.length).to.equal(0);
    });
  });
});
