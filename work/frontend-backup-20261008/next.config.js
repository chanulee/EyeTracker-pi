/** @type {import('next').NextConfig} */
const nextConfig = {
  // 카메라와 requestAnimationFrame 루프가 dev 에서 두 번 초기화되는 것을 막는다.
  reactStrictMode: false,
  experimental: {
    // 상위 디렉토리의 lockfile 때문에 워크스페이스 루트가 잘못 추론되는 것을 막는다.
    outputFileTracingRoot: __dirname,
  },
  async rewrites() {
    return [
      {
        source: '/street/360/:path*',
        destination: 'https://quiet-street-360.hello-ccid.chatgpt.site/:path*',
      },
      {
        source: '/street/tower/:path*',
        destination: 'https://quiet-street-tower.hello-ccid.chatgpt.site/:path*',
      },
      {
        source: '/street/brick/:path*',
        destination: 'https://quiet-street-brick-alley.hello-ccid.chatgpt.site/:path*',
      },
      {
        source: '/street/red/:path*',
        destination: 'https://quiet-street-red-road.hello-ccid.chatgpt.site/:path*',
      },
      {
        source: '/street/outline/:path*',
        destination: 'https://quiet-street-clarity.hello-ccid.chatgpt.site/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
