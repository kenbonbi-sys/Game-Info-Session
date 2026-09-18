import test from 'node:test';
import assert from 'node:assert/strict';
import { FINALE } from '../src/finale-config.js';
import { FINALE_TARGET, finaleBottlePose, finaleBeat, finaleCamera } from '../src/finale-scene.js';

const from = { x: 530, y: 560, width: 252, height: 392 };

test('bottle carries its charge-screen position through lift, wind-up and impact', () => {
  for (const reduced of [false, true]) {
    assert.deepEqual(finaleBottlePose(0, from, reduced), { ...from, rotation: 0 });
    for (const boundary of [FINALE.liftAt, FINALE.throwAt]) {
      const before = finaleBottlePose(boundary - .00001, from, reduced);
      const after = finaleBottlePose(boundary, from, reduced);
      for (const key of ['x', 'y', 'width', 'height', 'rotation']) {
        assert.ok(Math.abs(before[key] - after[key]) < .02, `${key} jumps at ${boundary}s`);
      }
    }
    const impact = finaleBottlePose(FINALE.impactAt, from, reduced);
    assert.equal(impact.x, FINALE_TARGET.x);
    assert.equal(impact.y, FINALE_TARGET.y);
    for (let t = 0; t <= FINALE.impactAt; t += .025) {
      const pose = finaleBottlePose(t, from, reduced);
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(pose.width > 0 && pose.height > 0);
    }
  }
});

test('captions and camera follow the shared server timeline on a mid-scene reconnect', () => {
  assert.equal(finaleBeat(FINALE.throwAt - .001).name, 'ready');
  assert.equal(finaleBeat(FINALE.throwAt).name, 'throw');
  assert.equal(finaleBeat(FINALE.impactAt).name, 'impact');
  assert.equal(finaleBeat(FINALE.defeatAt).name, 'defeated');
  assert.ok(FINALE.unleashSeconds > FINALE.defeatAt + 1.6, 'The complete boss dissolve plays before victory');
  assert.deepEqual(finaleCamera(FINALE.impactAt + 1, true), finaleCamera(0, true));
  assert.equal(finaleCamera(FINALE.impactAt + 1).x, FINALE_TARGET.x);
});
