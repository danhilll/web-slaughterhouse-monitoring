import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentState,paymentText} from './overdue.ts';
const now=new Date('2026-10-21T17:30:00Z'); // 2026-10-22 01:30 in Manila
test('overdue is Unpaid after the Manila due date; same-day unpaid is not overdue', () => {
 assert.equal(paymentState({payment_status:'Unpaid',due_date:'2026-10-21'},now),'Overdue');
 assert.equal(paymentState({payment_status:'Unpaid',due_date:'2026-10-22'},now),'Unpaid');
 assert.equal(paymentState({payment_status:'Paid',due_date:'2026-10-01'},now),'Paid');
 assert.equal(paymentState({payment_status:'Overdue'},now),'Overdue');
 assert.equal(paymentState({payment_status:'Unpaid',due_date:'not-a-day'},now),'Unpaid');
 assert.equal(paymentState({},now),null);
 assert.equal(paymentText({payment_status:'Unpaid',due_date:'2026-10-20'},now),'Overdue (unpaid after due date)');
});
