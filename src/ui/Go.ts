// "Take me there": a lesson's place, made one function the App holds. It switches the page and the Reports tab and
// outlines the element, the way the tutorial's cards do. `can` says whether the place is shown at this stage.

import { createContext } from 'react';
import type { Place } from '../content';

export interface Go {
  go: (place: Place) => void;
  /** Whether the place's page and tab are shown at this stage (and under the show-everything switch). */
  can: (place: Place) => boolean;
}

export const GoContext = createContext<Go>({ go: () => undefined, can: () => false });
