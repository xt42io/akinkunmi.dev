const visitors = [
  ["Amara", "Found my way here through OutRay. The little details on this site made me stay. Keep making things.", "M12 63Q22 25 37 17Q29 53 24 74M20 52L48 47M38 65Q52 23 56 42Q48 70 61 58Q71 39 72 48Q65 66 80 57Q97 33 98 47Q85 73 108 55Q115 41 117 48L114 62Q135 40 137 53Q134 66 150 56Q159 45 160 54L177 52M25 77Q91 68 173 72"],
  ["Noah", "A quiet corner of the web. Glad I stumbled in.", "M16 70Q29 22 33 30L56 63Q58 43 72 19M68 58Q79 37 87 45Q94 57 79 63Q67 65 72 52M94 55Q109 32 112 45L105 62L119 53M121 62Q134 8 142 17Q150 28 129 51Q148 34 151 48L149 61L165 52M21 77Q109 65 181 74"],
  ["Maya", "The night drive was an unexpected detour. Took the long way home :)", "M12 69Q29 19 37 21L34 58L59 26L57 65M64 57Q76 38 85 46L77 64Q91 58 98 48L94 63Q107 59 115 45Q117 69 96 83Q84 90 86 80Q95 70 120 58Q136 35 143 44L139 62L158 55M17 75Q69 67 99 71M128 76L180 70"],
  ["Tomi", "Signed with a trackpad. My handwriting would like to apologise.", "M16 31Q66 13 96 24M57 24Q44 54 46 71M64 59Q76 37 85 45Q91 59 78 64Q64 67 68 53M90 63Q101 40 106 45L101 60Q120 34 125 44L122 61L136 53M145 42L140 61L159 53M147 30L149 28M27 80Q94 66 175 72"],
  ["Eli", "Love seeing people build the things they wish existed. Hello from a rainy afternoon.", "M59 24Q35 13 24 36Q22 49 49 43Q17 47 20 65Q25 83 69 61M74 63Q98 13 101 22Q109 35 80 60L99 55M109 45L105 61L127 50M111 33L113 30M27 84Q100 70 157 74"],
  ["Zara", "Dropping a small hello before I head back to making things.", "M20 28Q53 17 73 24L20 68Q52 58 77 64M77 56Q90 34 99 43L93 62L109 54M109 62L119 44L116 55Q130 34 136 46M138 55Q150 37 159 44L154 61L172 52M24 79Q100 67 179 70"],
  ["Ravi", "Came for the projects, stayed for the music recommendations.", "M20 70L39 22Q67 14 69 33Q69 49 32 47M40 48Q54 66 75 68M77 55Q89 35 97 44L92 61L109 53M108 45L112 63Q127 53 133 40M146 43L140 60L162 52M149 31L151 28M24 81Q88 71 176 73"],
  ["Jo", "Your guestbook reminded me of the early web, in the best way.", "M35 27Q69 13 87 25M72 24Q62 70 40 76Q17 78 22 64Q27 53 41 57M85 57Q99 35 111 43Q122 59 101 66Q83 68 89 50M35 88Q108 73 169 80"],
];

export function mockGuestbookEntries(now = Date.now()) {
  return visitors.map(([authorName, message, path], index) => {
    const slug = authorName.toLowerCase();
    const createdAt = now - (index * 3 + 1) * 86_400_000;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path d="${path}" fill="none" stroke="#3f5146" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return {
      _id: `local-guestbook-${slug}`, _creationTime: createdAt, message, authorName,
      githubId: `sample:${slug}`, signature: `data:image/svg+xml,${encodeURIComponent(svg)}`, createdAt,
    };
  });
}
