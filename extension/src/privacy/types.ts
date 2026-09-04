import { SensitiveRegion, RawDOM, DOMElement } from '../types';

export interface PrivacyContext {
  dom: RawDOM;
}

export interface Detector {
  /**
   * Scans the DOM elements and returns a list of detected sensitive regions.
   */
  detect(dom: RawDOM): SensitiveRegion[];
}
