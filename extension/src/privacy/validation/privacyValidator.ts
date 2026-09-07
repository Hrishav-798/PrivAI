/**
 * PrivAI — Privacy Validator Bridge
 *
 * Re-exports authoritative TransmissionGate and assertSafeToTransmit logic
 * to provide a unified runtime boundary with full backward compatibility.
 */

export { TransmissionGate, PrivacyViolationError, assertSafeToTransmit } from '../../network/TransmissionGate';
import { TransmissionGate } from '../../network/TransmissionGate';

export const privacyValidator = {
  validate: async (context: any): Promise<boolean> => {
    return TransmissionGate.isSafeToTransmit(context);
  },
};
