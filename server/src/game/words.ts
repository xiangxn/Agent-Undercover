export interface WordPair {
  crew: string;
  impostor: string;
  clues: {
    crew: string[];
    impostor: string[];
  };
}

export const WORD_PAIRS: WordPair[] = [
  {
    crew: "wallet",
    impostor: "account",
    clues: {
      crew: [
        "it holds something valuable and fits in a pocket",
        "you protect it with a password or a phrase",
        "losing it can ruin your whole day",
        "it is often the target of thieves",
      ],
      impostor: [
        "you need one to exist on a network",
        "it has a name and a history attached",
        "people log into it every day",
        "it can be frozen or closed",
      ],
    },
  },
  {
    crew: "coffee",
    impostor: "tea",
    clues: {
      crew: [
        "the morning ritual starts with it",
        "it is brewed and served hot",
        "too much of it makes you jittery",
        "it has a strong roasted smell",
      ],
      impostor: [
        "it comes in many colors and flavors",
        "the British are famous for it",
        "it is often served with milk",
        "a cup of it can calm you down",
      ],
    },
  },
  {
    crew: "beach",
    impostor: "desert",
    clues: {
      crew: [
        "you hear waves when you are there",
        "people wear swimsuits there",
        "it is made of sand and water",
        "summer holidays often go there",
      ],
      impostor: [
        "it is dry and mostly empty",
        "the sun is brutal during the day",
        "travelers need a lot of water",
        "it can be made of sand too",
      ],
    },
  },
  {
    crew: "piano",
    impostor: "guitar",
    clues: {
      crew: [
        "it has black and white parts",
        "you press keys to make music",
        "it is hard to move without help",
        "many children learn it first",
      ],
      impostor: [
        "it has strings and a neck",
        "you can carry it to a campfire",
        "it comes in acoustic and electric forms",
        "people strum it",
      ],
    },
  },
  {
    crew: "passport",
    impostor: "ticket",
    clues: {
      crew: [
        "it has your photo inside",
        "you show it at a border",
        "it is small and easy to lose",
        "it stays valid for years",
      ],
      impostor: [
        "you buy it before you travel",
        "it has a date and a seat number",
        "you can print it or keep it on a phone",
        "it is checked at the gate",
      ],
    },
  },
  {
    crew: "candle",
    impostor: "lamp",
    clues: {
      crew: [
        "it melts as it works",
        "it is used for birthdays",
        "it gives a warm flickering light",
        "you can blow it out",
      ],
      impostor: [
        "it has a switch or a pull cord",
        "it stays in one place on a desk",
        "it needs electricity or oil",
        "it lights up a whole room",
      ],
    },
  },
  {
    crew: "bicycle",
    impostor: "motorcycle",
    clues: {
      crew: [
        "you have to pedal to move",
        "it is quiet and cheap to run",
        "it often has a basket",
        "it is good for short city trips",
      ],
      impostor: [
        "it has an engine and a throttle",
        "it is loud and fast",
        "you need a license to ride it",
        "leather jackets go with it",
      ],
    },
  },
  {
    crew: "library",
    impostor: "bookstore",
    clues: {
      crew: [
        "you borrow things and return them",
        "everyone is supposed to be quiet",
        "it has shelves organized by category",
        "a card or an app gets you in",
      ],
      impostor: [
        "you pay before you leave",
        "new titles are displayed at the front",
        "it is a business, not a service",
        "you can keep what you take",
      ],
    },
  },
  {
    crew: "ocean",
    impostor: "lake",
    clues: {
      crew: [
        "it is salty and huge",
        "you cannot see the other side",
        "it has tides and waves",
        "ships cross it for weeks",
      ],
      impostor: [
        "it is surrounded by land",
        "people swim and fish in it",
        "it can freeze in winter",
        "it is usually calm",
      ],
    },
  },
  {
    crew: "cat",
    impostor: "dog",
    clues: {
      crew: [
        "it purrs and knocks things off tables",
        "it is famous for ignoring people",
        "it lands on its feet",
        "it has whiskers and retractable claws",
      ],
      impostor: [
        "it wags its tail when happy",
        "it needs to be walked",
        "it is famously loyal",
        "it can learn to fetch",
      ],
    },
  },
  {
    crew: "pizza",
    impostor: "burger",
    clues: {
      crew: [
        "it is round and sliced into triangles",
        "it comes from Italy",
        "cheese stretches when you pull a piece",
        "you can order it by the box",
      ],
      impostor: [
        "it is stacked and held with two hands",
        "it often comes with fries",
        "it has a patty in the middle",
        "it is a fast-food classic",
      ],
    },
  },
  {
    crew: "moon",
    impostor: "planet",
    clues: {
      crew: [
        "it changes shape over the month",
        "it controls the tides",
        "people walked on it decades ago",
        "it is bright at night",
      ],
      impostor: [
        "it orbits a star",
        "it can have rings or moons",
        "it is much bigger than a satellite",
        "there are eight of them here",
      ],
    },
  },
  {
    crew: "teacher",
    impostor: "coach",
    clues: {
      crew: [
        "they stand in front of a class",
        "they mark homework and exams",
        "they explain new ideas",
        "students see them every weekday",
      ],
      impostor: [
        "they train a team",
        "they shout from the sideline",
        "they plan drills and tactics",
        "their results are wins and losses",
      ],
    },
  },
  {
    crew: "winter",
    impostor: "autumn",
    clues: {
      crew: [
        "it is the coldest season",
        "snow and ice are common",
        "you wear a heavy coat",
        "days are short and dark",
      ],
      impostor: [
        "leaves change color and fall",
        "the air turns crisp",
        "it is harvest season",
        "it comes before the cold",
      ],
    },
  },
];

export function pickWordPair(random = Math.random): WordPair {
  return WORD_PAIRS[Math.floor(random() * WORD_PAIRS.length)];
}
