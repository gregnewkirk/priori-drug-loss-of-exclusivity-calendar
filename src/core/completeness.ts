// Priori operational scaffold: track which inputs a synthesized result depends
// on and whether all were available, so we never sell a silently partial answer
// as complete, and never charge a synthesis event on incomplete inputs.

export interface Completeness {
  inputsExpected: string[];
  inputsAvailable: string[];
  missing: string[];
  complete: boolean;
}

export function assessCompleteness(expected: string[], available: string[]): Completeness {
  const missing = expected.filter((e) => !available.includes(e));
  return {
    inputsExpected: expected,
    inputsAvailable: available,
    missing,
    complete: missing.length === 0,
  };
}
