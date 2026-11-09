import { supabase } from './supabase';
import type { Severity } from '../d6433-07/catalog.ts';
import type { SampleOutput } from '../d6433-07/sample.ts';

export type DemoObservation = { code: number; severity: Severity | null; quantity: number };

/**
 * Why a server calculation did not return a PCI.
 * `input`: the server rejected the measurements (fix them; do not fall back).
 * `unavailable`: switched off, no curve package, or no connection (fall back to illustrative curves).
 */
export class DemoCalculationError extends Error {
  constructor(message: string, readonly reason: 'input' | 'unavailable') {
    super(message);
  }
}

/**
 * Public prototype calculation on the `calculate-pci` edge function (`demo` kind).
 * Uses the same provisional D6433-07 curves as official inspections, needs no sign-in and
 * saves nothing. Only the results come back; the curves never reach the browser.
 */
export async function computeDemoOnServer(areaSqm: number, observations: DemoObservation[]): Promise<SampleOutput> {
  const { data, error } = await supabase.functions.invoke('calculate-pci', { body: { kind: 'demo', area_sqm: areaSqm, observations } });
  if (error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      let message = error.message;
      try { message = (await response.json()).error ?? message; } catch { /* keep the transport message */ }
      throw new DemoCalculationError(message, response.status === 409 ? 'input' : 'unavailable');
    }
    throw new DemoCalculationError('The LAKAD server could not be reached.', 'unavailable');
  }
  if (!data || typeof data !== 'object' || typeof (data as SampleOutput).pci !== 'number') throw new DemoCalculationError('The LAKAD server returned no PCI.', 'unavailable');
  return data as SampleOutput;
}
