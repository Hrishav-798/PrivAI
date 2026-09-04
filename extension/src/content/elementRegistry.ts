export class ElementRegistry {
  private elementIdMap = new WeakMap<Element, string>();
  private idCounter = 0;

  getIdForElement(element: Element, prefix: string = 'agent-el'): string {
    if (this.elementIdMap.has(element)) {
      return this.elementIdMap.get(element)!;
    }

    const newId = `${prefix}-${this.idCounter++}`;
    this.elementIdMap.set(element, newId);
    
    // Inject the ID into the DOM for visibility/debugging
    element.setAttribute('data-agent-id', newId);
    
    return newId;
  }

  reset() {
    this.idCounter = 0;
    this.elementIdMap = new WeakMap();
  }
}

export const registry = new ElementRegistry();
