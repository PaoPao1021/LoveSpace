const assert = require('assert')
const Module = require('module')

process.env.NODE_ENV = 'test'
const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return {
      DYNAMIC_CURRENT_ENV: 'test',
      init() {},
      database() {
        return { command: {} }
      }
    }
  }
  return originalLoad(request, parent, isMain)
}

const { __test } = require('../cloudfunctions/fitness/index')
const { buildNutritionPlan, normalizeCheckin, workoutsForCheckin } = __test

const checkin = normalizeCheckin({
  workouts: [
    { id: 'strength-1', type: 'strength', startTime: '18:30', minutes: 45, calories: 320 },
    { id: 'run-1', type: 'run', startTime: '19:25', minutes: 25, calories: 210 }
  ],
  steps: 9200,
  water: 7,
  sleep: 7.5,
  healthyMeal: true,
  weight: 70
})

assert.equal(checkin.workoutCount, 2)
assert.equal(checkin.minutes, 70)
assert.equal(checkin.calories, 530)
assert.equal(workoutsForCheckin(checkin).length, 2)

const goal = { goalType: 'fat-loss', currentWeight: 70 }
const trainingPlan = buildNutritionPlan(goal, checkin)
const restPlan = buildNutritionPlan(goal, null)
assert.equal(trainingPlan.ready, true)
assert.equal(trainingPlan.intensity, '中等训练量')
assert(trainingPlan.calories > restPlan.calories)
assert.equal(trainingPlan.macros.length, 3)
assert(trainingPlan.macros.every(item => item.grams > 0 && item.ratio > 0))
assert(Math.abs(trainingPlan.macros.reduce((sum, item) => sum + item.ratio, 0) - 100) <= 1)

assert.throws(() => normalizeCheckin({
  workouts: [{ id: 'bad', type: 'run', startTime: '18:30', minutes: 30, calories: 0 }]
}), /消耗热量/)

assert.equal(buildNutritionPlan({ goalType: 'shape' }, null).ready, false)
console.log('Fitness domain tests passed: multi-workout totals, validation, nutrition plan and fallback.')
