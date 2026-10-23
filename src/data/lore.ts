/**
 * Lore for the prototype mystery: "What happened to the Lantern Company?"
 * Pages get stranger as you find more: first logs, then pleas, then pages from inside the fog.
 * Placeholders: {bellDir} is the compass direction of the Drowned Bell from your landing.
 */

export interface LorePage {
  id: string;
  title: string;
  /** Encrypted pages need an Archive to read. */
  encrypted: boolean;
  text: string;
}

export const PAGES: LorePage[] = [
  {
    id: 'log-3',
    title: 'Company log, day 3',
    encrypted: false,
    text: 'Landed in fog so thick the boats lost each other a stone’s throw from shore. We lit the great lantern on the first night, and the fog drew back from it like a hand from a stove. Fish in plenty. Spirits good. — Keeper Ines Varro, for the Lantern Company',
  },
  {
    id: 'log-19',
    title: 'Company log, day 19',
    encrypted: false,
    text: 'The fog moves against the wind. Tobias swears it gathers thickest around the lamps at night. “Like moths,” he says. I told him moths come to the light to die. He did not laugh.',
  },
  {
    id: 'oil-note',
    title: 'Quartermaster’s note',
    encrypted: false,
    text: 'Lamp oil reserve down by a third. We burned double through the ringing again. The fishermen say the bell sounds from under the water, out to the {bellDir}. No one will row out to look.',
  },
  {
    id: 'letter',
    title: 'Letter, never sent',
    encrypted: false,
    text: 'Dear Maren, people are leaving in the night. Not by boat. They walk into the fog, and the ones who see them go say they were smiling. I am not going to smile. I am going to keep the lamps lit. — your brother, Tobias',
  },
  {
    id: 'log-61',
    title: 'Company log, day 61',
    encrypted: false,
    text: 'Half the houses stand empty with their doors open. No tracks. Only the smell of lamp oil, and the fog lying in the doorways like a dog that has found its home.',
  },
  {
    id: 'child',
    title: 'Scrap of paper, a child’s hand',
    encrypted: false,
    text: 'mama says not to listen to the fog. but it sings. it knows my name and it sings it very nicely',
  },
  {
    id: 'log-88',
    title: 'Company log, day 88',
    encrypted: false,
    text: 'I have found the bell. It hangs in a drowned chapel on the {bellDir} shore, and when it rings the fog comes in. I believe it can be rung by hand, and that it ends things. What I learned next I have written in cipher. The Company must not read it.',
  },
  {
    id: 'cipher-1',
    title: 'Cipher, first leaf',
    encrypted: true,
    text: 'It is not weather. It is hungry. It eats light the way we eat bread, and every lamp we lit was a table we laid for it. The brighter we burned, the closer it came.',
  },
  {
    id: 'cipher-2',
    title: 'Cipher, second leaf',
    encrypted: true,
    text: 'I heard Tobias tonight, out past the last lamp. He said it is warm in there. He said it is not lonely. He said my name the way he used to, and I nearly went.',
  },
  {
    id: 'cipher-bell',
    title: 'Cipher, last leaf',
    encrypted: true,
    text: 'To ring the bell: stand in your own light on the drowned shore and pull. The fog will take the island, all of it. And then, I think, it lets you begin again somewhere else. I have done this before. I do not remember how many times.',
  },
];

/** The page that teaches you how to ring the Drowned Bell. */
export const BELL_PAGE = 'cipher-bell';

/** Names of the Lantern Company, heard in the fog before any of your own are lost. */
export const COMPANY_NAMES = ['Ines', 'Tobias', 'Maren', 'old Hollis', 'Pell', 'the cooper’s boy'];

/** First names given to residents when they walk into the fog. */
export const RESIDENT_NAMES = [
  'Ada', 'Bram', 'Cora', 'Dell', 'Edda', 'Finn', 'Greta', 'Hugo', 'Ilse', 'Jory', 'Kit', 'Lene', 'Milo', 'Nell',
  'Oskar', 'Pia', 'Quill', 'Rosa', 'Sander', 'Tilde', 'Ulf', 'Vera', 'Wim', 'Yara', 'Zeb', 'Agnes', 'Bastian',
  'Clem', 'Dora', 'Elias', 'Fenna', 'Gus', 'Hanne', 'Ivo', 'Jette', 'Lars', 'Mila', 'Noor', 'Otto', 'Runa',
];

/** Lines whispered from the fog during a surge. {name} is someone it has taken. */
export const WHISPERS = [
  '{name}: “It doesn’t hurt. It’s warm in here.”',
  '{name}: “Why did you let the light go out?”',
  '{name}: “We were so cold, and then we weren’t.”',
  '{name}: “Come and see. Just to the edge.”',
  '{name}: “I can hear the bell. Can you hear the bell?”',
  '{name}: “Leave a lamp burning for me.”',
  '{name}: “Is there still bread? I miss bread.”',
  '{name}: “Don’t be afraid. Everyone is here.”',
];

/** Shown when the Drowned Bell is rung: the first big reveal. {names} lists people the fog has taken. */
export const FINALE = [
  'You pull the rope. The bell does not ring so much as open, and the sound goes out across the water in a ring you can see.',
  'The fog comes in. Not drifting: walking. It pours up the beach and through the streets and over the lamps, one by one, until the last light is a coal and then not even that.',
  'In the fog there are faces. Ines. Tobias. {names}. They are not dead. They never left. The Lantern Company did not flee this island and did not die on it. They walked into the fog, and they became it.',
  'It is warm, the way they said. It is not lonely. Something vast and patient turns its attention to you, and is glad.',
  'And then, very far off, a different shore. Cold sand. A lantern in your hand that you do not remember lighting.',
];
