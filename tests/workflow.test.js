import { describe, it, expect } from 'vitest';
import { seedTickets, transition, readTickets, publishedContent } from '../src/workflow';
describe('content review guardrails', () => {
  it('applies content patches only when published', () => {
    expect(publishedContent(seedTickets).deadline).toBe('July 1, 2027');
    let ticket = seedTickets[0];
    for (const next of ['In review','Approved']) ticket = transition(ticket,next);
    expect(publishedContent([ticket]).deadline).toBe('July 1, 2027');
    ticket = transition(ticket,'Published');
    expect(publishedContent([ticket]).deadline).toBe('August 15, 2027');
  });
  it('resolves competing published changes by publication timestamp', () => {
    const earlier = { ...seedTickets[0], status:'Published', history:[{ at:'2027-01-01T00:00:00Z' }] };
    const later = { ...earlier, patch:{field:'deadline',value:'September 1, 2027'}, history:[{at:'2027-02-01T00:00:00Z'}] };
    expect(publishedContent([later,earlier]).deadline).toBe('September 1, 2027');
  });
  it('blocks publishing an unreviewed draft', () => expect(() => transition(seedTickets[0], 'Published')).toThrow('Invalid workflow'));
  it('requires review and approval, records each transition without mutating the seed', () => {
    let ticket = seedTickets[0];
    for (const next of ['In review','Approved','Published']) ticket = transition(ticket, next, '2026-01-01T00:00:00Z');
    expect(ticket.status).toBe('Published'); expect(ticket.history).toHaveLength(3); expect(seedTickets[0].status).toBe('Draft');
  });
  it('allows a reviewer to return an edit', () => expect(transition(seedTickets[1], 'Draft').status).toBe('Draft'));
  it('recovers corrupt and inaccessible storage', () => {
    expect(readTickets({ getItem: () => '{bad' })).toEqual(seedTickets);
    expect(readTickets({ getItem: () => { throw Error(); } })).toEqual(seedTickets);
    expect(readTickets({ getItem: () => JSON.stringify([{status:'Published'}]) })).toEqual(seedTickets);
  });
});
