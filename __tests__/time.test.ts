import { timeBucket, isWeekend, dayKey, daysBetween } from '../src/domain/time';

describe('time bucket', () => {
  test('late night 02:00', () => {
    expect(timeBucket(new Date('2026-08-28T02:30:00'))).toBe('late');
  });
  test('early 06:00', () => {
    expect(timeBucket(new Date('2026-08-28T06:00:00'))).toBe('early');
  });
  test('morning 10:00', () => {
    expect(timeBucket(new Date('2026-08-28T10:00:00'))).toBe('morning');
  });
  test('day 15:00', () => {
    expect(timeBucket(new Date('2026-08-28T15:00:00'))).toBe('day');
  });
  test('evening 20:00', () => {
    expect(timeBucket(new Date('2026-08-28T20:00:00'))).toBe('evening');
  });
  test('night 23:00', () => {
    expect(timeBucket(new Date('2026-08-28T23:00:00'))).toBe('night');
  });
  test('boundary 04:59 = late', () => {
    expect(timeBucket(new Date('2026-08-28T04:59:00'))).toBe('late');
  });
  test('boundary 05:00 = early', () => {
    expect(timeBucket(new Date('2026-08-28T05:00:00'))).toBe('early');
  });
});

describe('isWeekend', () => {
  test('Saturday 2026-08-29', () => {
    expect(isWeekend(new Date('2026-08-29T12:00:00'))).toBe(true);
  });
  test('Sunday 2026-08-30', () => {
    expect(isWeekend(new Date('2026-08-30T12:00:00'))).toBe(true);
  });
  test('Monday 2026-08-31', () => {
    expect(isWeekend(new Date('2026-08-31T12:00:00'))).toBe(false);
  });
  test('Friday 2026-08-28', () => {
    expect(isWeekend(new Date('2026-08-28T12:00:00'))).toBe(false);
  });
});

describe('dayKey + daysBetween', () => {
  test('dayKey is YYYY-MM-DD', () => {
    expect(dayKey(new Date('2026-08-28T15:30:00'))).toBe('2026-08-28');
  });
  test('daysBetween same day = 0', () => {
    expect(daysBetween('2026-08-28', '2026-08-28')).toBe(0);
  });
  test('daysBetween 1 day', () => {
    expect(daysBetween('2026-08-28', '2026-08-29')).toBe(1);
  });
  test('daysBetween 30 days', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30);
  });
  test('daysBetween negative', () => {
    expect(daysBetween('2026-08-31', '2026-08-28')).toBe(-3);
  });
});
