const PRESS_BY_DOMAIN: Record<string, string> = {
  'yna.co.kr': '연합뉴스', 'newsis.com': '뉴시스', 'news1.kr': '뉴스1',
  'chosun.com': '조선일보', 'donga.com': '동아일보', 'joongang.co.kr': '중앙일보',
  'hani.co.kr': '한겨레', 'khan.co.kr': '경향신문', 'hankookilbo.com': '한국일보',
  'seoul.co.kr': '서울신문', 'segye.com': '세계일보', 'munhwa.com': '문화일보',
  'kmib.co.kr': '국민일보', 'naeil.com': '내일신문',
  'hankyung.com': '한국경제', 'mk.co.kr': '매일경제', 'sedaily.com': '서울경제',
  'mt.co.kr': '머니투데이', 'edaily.co.kr': '이데일리', 'fnnews.com': '파이낸셜뉴스',
  'heraldcorp.com': '헤럴드경제', 'asiae.co.kr': '아시아경제', 'biz.chosun.com': '조선비즈',
  'ytn.co.kr': 'YTN', 'kbs.co.kr': 'KBS', 'imbc.com': 'MBC', 'sbs.co.kr': 'SBS',
  'jtbc.co.kr': 'JTBC', 'mbn.co.kr': 'MBN', 'tvchosun.com': 'TV조선',
  'ichannela.com': '채널A', 'nocutnews.co.kr': '노컷뉴스',
  'ohmynews.com': '오마이뉴스', 'pressian.com': '프레시안', 'sisain.co.kr': '시사IN',
  'sisajournal.com': '시사저널', 'dailian.co.kr': '데일리안', 'newdaily.co.kr': '뉴데일리',
  'busan.com': '부산일보', 'kookje.co.kr': '국제신문', 'kyeonggi.com': '경기일보',
  'sportsseoul.com': '스포츠서울', 'sportschosun.com': '스포츠조선',
  'sports.chosun.com': '스포츠조선', 'osen.co.kr': 'OSEN',
  'spotvnews.co.kr': '스포티비뉴스', 'starnewskorea.com': '스타뉴스',
  'mydaily.co.kr': '마이데일리', 'xportsnews.com': '엑스포츠뉴스',
  'interfootball.co.kr': '인터풋볼', 'fourfourtwo.co.kr': '포포투',
  'zdnet.co.kr': '지디넷코리아', 'etnews.com': '전자신문', 'bloter.net': '블로터',
  'wikitree.co.kr': '위키트리', 'insight.co.kr': '인사이트',
  'koreadaily.com': '미주중앙일보', 'koreatimes.com': '미주한국일보',
  'v.daum.net': '다음 뉴스', 'n.news.naver.com': '네이버 뉴스',
  'topstarnews.net': '톱스타뉴스', 'newsen.com': '뉴스엔',
  'tvreport.co.kr': 'TV리포트', 'sportsworldi.com': '스포츠월드',
  'sportsq.co.kr': '스포츠Q', 'thespike.co.kr': '더스파이크',
  'jumpball.co.kr': '점프볼', 'basketkorea.com': '바스켓코리아',
  'inews24.com': '아이뉴스24', 'newspim.com': '뉴스핌',
  'ajunews.com': '아주경제', 'mediapen.com': '미디어펜',
  'sisaon.co.kr': '시사오늘', 'nate.com': '네이트',
};

export function pressFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    // sports.donga.com → sports.donga.com, donga.com 순으로 매칭 시도
    for (let i = 0; i < parts.length - 1; i++) {
      const press = PRESS_BY_DOMAIN[parts.slice(i).join('.')];
      if (press) return press;
    }
    return host;
  } catch {
    return '알 수 없음';
  }
}
