describe('RFC-005 Preset: mobile-3g', () => {
  it('declarative preset name resolves and applies network latency', () => {
    cy.injectChaos({ presets: ['mobile-3g'], seed: 1234 });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status', { timeout: 10000 }).should('have.text', 'Success!');
    cy.get('#timing').invoke('text').then((text) => {
      expect(parseInt(text, 10)).to.be.greaterThan(1000);
    });
    cy.getChaosLog().then((log) => {
      const events = log as Array<{ type: string; applied: boolean }>;
      expect(events.some((e) => e.type === 'network:latency' && e.applied)).to.be.true;
    });
  });

  it('camelCase mobileThreeG resolves to the same preset', () => {
    cy.injectChaos({ presets: ['mobileThreeG'], seed: 1234 });
    cy.visit('/');
    cy.get('#fetch-data').click();
    cy.get('#status', { timeout: 10000 }).should('have.text', 'Success!');
    cy.getChaosLog().then((log) => {
      const events = log as Array<{ type: string }>;
      expect(events.some((e) => e.type === 'network:latency')).to.be.true;
    });
  });
});
