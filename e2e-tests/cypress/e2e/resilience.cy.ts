import type { ChaosConfig } from '../../../packages/core/src/config';

describe('Resilience Tests', () => {
  const BASE_URL = 'http://127.0.0.1:8080';

  it('should fetch and display data successfully', () => {
    cy.visit(BASE_URL);
    cy.get('#fetch-data').click();
    cy.get('#status').should('have.text', 'Success!');
    cy.get('#result').should('contain.text', '"userId": 1');
  });

  it('should display an error message when the API fails', () => {
    const apiFailureConfig: ChaosConfig = {
      network: {
        failures: [{
          urlPattern: 'jsonplaceholder.typicode.com/todos/1',
          statusCode: 503,
          probability: 1.0,
        }],
      },
    };

    cy.injectChaos(apiFailureConfig);

    cy.visit(BASE_URL);
    cy.get('#fetch-data').click();

    cy.get('#status').should('have.text', 'Error!');
    cy.get('#result').should('contain.text', 'Failed to fetch data: API Error: 503');
  });
});


