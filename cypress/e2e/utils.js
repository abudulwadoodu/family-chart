// This worktree's Vite dev server is fixed to 8082 (see vite.config.js) so it
// doesn't collide with the main worktree (8080) or ui-enhancements (8081).
export const LOCAL_HOST_LIVE = 'http://localhost:8082'
export const LOCAL_HOST_PERVIEW = 'http://localhost:4111'

export function basicF3Tests(card_n=3) {
  cy.get('#FamilyChart').should('exist')
  cy.get('.f3').should('exist')
  cy.get('.card_cont').should('have.length.at.least', card_n)
}

export const LOCAL_HOST = Cypress.env('preview') ? LOCAL_HOST_PERVIEW : LOCAL_HOST_LIVE