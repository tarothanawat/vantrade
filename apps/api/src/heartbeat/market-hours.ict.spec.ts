import { isInIctSession } from './market-hours.util';

describe('isInIctSession', () => {
  const utcDate = (hour: number, minute = 0): Date => {
    const d = new Date('2024-01-15T00:00:00Z');
    d.setUTCHours(hour, minute, 0, 0);
    return d;
  };

  describe('ALL session', () => {
    it('returns true at any hour', () => {
      expect(isInIctSession('ALL', utcDate(0))).toBe(true);
      expect(isInIctSession('ALL', utcDate(12))).toBe(true);
      expect(isInIctSession('ALL', utcDate(23))).toBe(true);
    });
  });

  describe('LONDON session (07:00–10:00 UTC)', () => {
    it('returns true at 07:00 UTC', () => {
      expect(isInIctSession('LONDON', utcDate(7))).toBe(true);
    });

    it('returns true at 09:30 UTC', () => {
      expect(isInIctSession('LONDON', utcDate(9, 30))).toBe(true);
    });

    it('returns false at 10:00 UTC (exclusive end)', () => {
      expect(isInIctSession('LONDON', utcDate(10))).toBe(false);
    });

    it('returns false at 06:59 UTC (before window)', () => {
      expect(isInIctSession('LONDON', utcDate(6, 59))).toBe(false);
    });

    it('returns false at 14:00 UTC', () => {
      expect(isInIctSession('LONDON', utcDate(14))).toBe(false);
    });

    it('corresponds to ~14:00 BKK (UTC+7) — strategy reference time', () => {
      // London session 07:00 UTC = 14:00 Bangkok time (UTC+7)
      expect(isInIctSession('LONDON', utcDate(7))).toBe(true);
    });
  });

  describe('NEW_YORK session (13:00–16:00 UTC)', () => {
    it('returns true at 13:00 UTC', () => {
      expect(isInIctSession('NEW_YORK', utcDate(13))).toBe(true);
    });

    it('returns true at 15:59 UTC', () => {
      expect(isInIctSession('NEW_YORK', utcDate(15, 59))).toBe(true);
    });

    it('returns false at 16:00 UTC (exclusive end)', () => {
      expect(isInIctSession('NEW_YORK', utcDate(16))).toBe(false);
    });

    it('returns false at 12:59 UTC (before window)', () => {
      expect(isInIctSession('NEW_YORK', utcDate(12, 59))).toBe(false);
    });

    it('corresponds to ~20:00 BKK (UTC+7) — strategy reference time', () => {
      // NY session 13:00 UTC = 20:00 Bangkok time (UTC+7)
      expect(isInIctSession('NEW_YORK', utcDate(13))).toBe(true);
    });
  });

  describe('OVERLAP session (13:00–16:00 UTC)', () => {
    it('returns true at 13:00 UTC', () => {
      expect(isInIctSession('OVERLAP', utcDate(13))).toBe(true);
    });

    it('returns false at 16:00 UTC', () => {
      expect(isInIctSession('OVERLAP', utcDate(16))).toBe(false);
    });
  });

  describe('uses current time when no date provided', () => {
    it('does not throw', () => {
      expect(() => isInIctSession('ALL')).not.toThrow();
    });
  });
});
