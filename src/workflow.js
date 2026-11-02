export const seedTickets = [
  { id: 'WEB-104', title: 'Update application deadline', department: 'Admissions', status: 'Draft', note: 'Admissions approved an extension. Update the program information before the recruitment event.', patch: { field: 'deadline', value: 'August 15, 2027' }, history: [] },
  { id: 'WEB-105', title: 'Repair program contact link', department: 'Academic Affairs', status: 'In review', note: 'Confirm the department email before publishing.', history: [] },
  { id: 'WEB-106', title: 'Add meaningful image alt text', department: 'Marketing', status: 'Published', note: 'Describe the scene without repeating the caption.', history: [] }
];
const transitions = { Draft: ['In review'], 'In review': ['Draft', 'Approved'], Approved: ['Published'], Published: [] };
export const initialContent = { deadline: 'July 1, 2027', contact: 'Digital Media advising team', visit: 'Fridays at 10 a.m.' };
export const fieldLabels = { deadline: 'Application deadline', contact: 'Advising contact', visit: 'Studio visit schedule' };
export function publishedContent(tickets) {
  const content = { ...initialContent };
  tickets.filter(t => t.status === 'Published' && t.patch && Object.hasOwn(initialContent,t.patch.field) && typeof t.patch.value === 'string')
    .sort((a,b) => (a.history.at(-1)?.at ?? '').localeCompare(b.history.at(-1)?.at ?? ''))
    .forEach(t => { content[t.patch.field] = t.patch.value; });
  return content;
}
export function nextStatuses(status) { return transitions[status] ?? []; }
export function transition(ticket, next, timestamp = new Date().toISOString()) {
  if (!nextStatuses(ticket.status).includes(next)) throw new Error('Invalid workflow transition');
  return { ...ticket, status: next, history: [...ticket.history, { from: ticket.status, to: next, at: timestamp }] };
}
export function readTickets(storage) {
  try { const value = JSON.parse(storage.getItem('campus-tickets')); if (Array.isArray(value) && value.length && value.every(t => typeof t.id === 'string' && typeof t.title === 'string' && typeof t.department === 'string' && typeof t.note === 'string' && Object.hasOwn(transitions, t.status) && Array.isArray(t.history))) return value; } catch { /* Recover from unavailable or malformed storage. */ }
  return structuredClone(seedTickets);
}
