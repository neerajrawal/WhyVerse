'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bandForMode, cleanMessages, pickPages, formatConversation } = require('../../src/chat/pure');

test('chat never goes beyond Teen rules', () => {
  assert.equal(bandForMode('junior'), 'junior');
  assert.equal(bandForMode('all'), 'junior');
  assert.equal(bandForMode('teen'), 'teen');
  assert.equal(bandForMode('everything'), 'teen');
  assert.equal(bandForMode(undefined), 'junior');
});
test('messages: bad shapes are refused, long ones cut, must end with the visitor', () => {
  assert.equal(cleanMessages('hi'), null);
  assert.equal(cleanMessages([{ role: 'system', content: 'x' }]), null);
  assert.equal(cleanMessages([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]), null);
  const long = cleanMessages([{ role: 'user', content: 'x'.repeat(900) }]);
  assert.equal(long[0].content.length, 500);
  const many = cleanMessages(Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })).concat([{ role: 'user', content: 'last' }]));
  assert.ok(many.length <= 8 && many[0].role === 'user' && many.at(-1).content === 'last');
});
test('conversation is wrapped as data', () => {
  assert.match(formatConversation([{ role: 'user', content: 'hi' }]), /<conversation>\nVisitor: hi\n<\/conversation>/);
});
test('page suggestions match on title words only', () => {
  const pages = [{ slug: 'a', title: 'Why is the sky blue?' }, { slug: 'b', title: 'How bees make honey' }];
  assert.deepEqual(pickPages('why is the sky blue at noon', pages), [{ slug: 'a', title: 'Why is the sky blue?' }]);
  assert.deepEqual(pickPages('what is the', pages), []);
});
