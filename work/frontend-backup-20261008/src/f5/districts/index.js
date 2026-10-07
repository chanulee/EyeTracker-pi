import * as gangnam from './gangnam';
import * as jongno from './jongno';
import * as mapo from './mapo';

export const SCENES = {
  종로구: jongno,
  마포구: mapo,
  강남구: gangnam,
};

export function sceneFor(districtName) {
  return SCENES[districtName] || SCENES['종로구'];
}
