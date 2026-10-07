// 강남 대로, 종로 한옥, 마포 벽돌 골목. 페이지 주소가 같아도 파노라마 파일은 구마다 다르다.
export const DISTRICT_STREETS = {
  종로구: 'https://quiet-street-hanok.hello-ccid.chatgpt.site/assets/hanok-clear-panorama.webp',
  마포구: 'https://quiet-street-brick-alley.hello-ccid.chatgpt.site/assets/brick-alley-panorama.webp?v=clear-v2',
  강남구: 'https://quiet-street-360.hello-ccid.chatgpt.site/assets/boulevard-detail-panorama.webp',
};

export function streetSiteFor(name) {
  return DISTRICT_STREETS[name] || DISTRICT_STREETS['종로구'];
}
