import type { Segment } from './audioCues';
import { appendSegments, emptyManuscript } from './manuscript';
import type { Manuscript } from './types';

export const EMBER_KING_TITLE = 'Example: The Ember King';
export const EMBER_KING_TITLE_LEGACY = 'The Ember King';
export const EMBER_KING_SERIES = 'Example: The Ember Cycle';
export const EMBER_KING_SERIES_LEGACY = 'The Ember Cycle';

export function isEmberKingExampleTitle(title: string): boolean {
  return title === EMBER_KING_TITLE || title === EMBER_KING_TITLE_LEGACY;
}

export function isEmberKingExampleSeries(name: string): boolean {
  return name === EMBER_KING_SERIES || name === EMBER_KING_SERIES_LEGACY;
}

/** True when the shipped example is already in the library (by its example title). */
export function libraryHasEmberKingSample(books: Array<{ title: string }>): boolean {
  return books.some((b) => isEmberKingExampleTitle(b.title));
}

export const EMBER_KING_CHAPTERS = [
  'The Exile Returns',
  "The Oracle's Warning",
  'The Shard-Blade',
  'The Ashen Order',
  'Cinder and Crown',
] as const;

function ch(title: string): Segment {
  return { type: 'structure', event: { kind: 'chapter', title } };
}

function sc(title?: string): Segment {
  return { type: 'structure', event: { kind: 'scene', title } };
}

function p(text: string): Segment[] {
  return [{ type: 'structure', event: { kind: 'paragraph' } }, { type: 'text', text }];
}

/** Sample manuscript large enough to exercise Scrivener chapter/scene/paragraph split. */
export function emberKingSampleManuscript(): Manuscript {
  return {
    blocks: appendSegments(emptyManuscript().blocks, ([
      ch(EMBER_KING_CHAPTERS[0]),
      sc('The Ridge'),
      p('Kaeldros crested the ridge as the last light bled from the sky, Vaelthorn Keep a black tooth against the clouds.'),
      p('Wind combed the dry grass and carried the smell of old smoke. He had not stood on this height in twelve years, and the keep had not grown kinder.'),
      p('He touched the empty place at his hip where Sunspar had once hung. The leather was still shaped to the shard-blade’s weight.'),
      p('“Home,” he said, and the word tasted like iron.'),

      sc('The Gates'),
      p('The road down was a scar of loose stone. Kaeldros took it at a walk, counting the new watch-fires along the outer wall.'),
      p('Two sentries crossed their spears when he reached the torchlight. One was a boy. The other had a scar Kaeldros remembered from the old wars.'),
      p('“Name and business,” the scarred man said.'),
      p('“Kaeldros. I have business with the keep, and the keep has business with me.”'),
      p('The boy’s spear-tip trembled. “The exile? They said you were dead.”'),
      p('“They say a great many things,” Kaeldros said. “Open the gate.”'),

      sc('The Courtyard'),
      p('The courtyard was quieter than he remembered. Ash had drifted into the corners of the flagstones, and the fountain was dry.'),
      p('Kaeldros crossed to the well and drew a bucket. The water was cold and tasted of stone.'),
      p('“You should not have come,” a voice said from the cloister shadow.'),
      p('He did not turn at once. “That is becoming a popular opinion.”'),

      ch(EMBER_KING_CHAPTERS[1]),
      sc('The Stair'),
      p('Aelith waited on the lowest step of the old oracle stair, her cloak the color of deep water.'),
      p('“The keep listens,” she said. “Even the stones have taken sides.”'),
      p('“Then tell the stones I am not here to kneel.”'),
      p('She glanced back, and the faint light caught her eyes. “I did not call you here to kneel. I called you here to hear a warning you will hate.”'),

      sc('The Deep Chamber'),
      p('The chamber under Vaelthorn Keep had once been a cistern. Now it held a bowl of black water and a single chair.'),
      p('Aelith knelt and touched the surface. Ripples wrote a crown of cinders, then a blade, then a gate standing open in a burning wall.'),
      p('“The Ember King rises whether you claim the name or not,” she said. “The Ashen Order has already chosen their candidate.”'),
      p('Kaeldros laughed once, without humor. “Let them have the title. I came for what they took.”'),
      p('“Sunspar is not a keepsake,” Aelith said. “It is a hinge. If you draw it in anger, the keep will remember every fire it has ever known.”'),
      p('He looked at the water until the images died. “Then I will draw it carefully.”'),

      sc('The Warning'),
      p('They climbed in silence. At the first landing Aelith stopped him with two fingers on his sleeve.'),
      p('“If you walk into the vault tonight, they will be waiting,” she said. “Not soldiers. Priests who think ash is a kind of prayer.”'),
      p('“Not these. They do not argue. They unmake.”'),
      p('Kaeldros met her gaze. “Will you come with me?”'),
      p('“I will walk as far as the door,” Aelith said. “After that, the blade will decide if it still knows your hand.”'),

      ch(EMBER_KING_CHAPTERS[2]),
      sc('The Vault Stair'),
      p('The vault stair corkscrewed behind the old chapel. Kaeldros counted sixty-one steps and stopped counting when the air turned metallic.'),
      p('“They moved the wards,” she whispered. “The lock is new.”'),
      p('He set his palm on the iron. Heat leaked through the metal, as if something on the other side were breathing.'),
      p('“Then we do this the old way,” he said, and drew the thin knife he had carried through exile.'),

      sc('Sunspar'),
      p('The door gave with a sound like a snapped bone. Inside, Sunspar lay on a stone plinth, wrapped in faded red cloth.'),
      p('Even covered, the shard-blade threw a thin gold line across the ceiling, as if dawn had been folded and stored.'),
      p('Kaeldros uncovered it. The hilt fit his hand with an intimacy that made his throat tight.'),
      p('“Hello, old friend,” he said.'),
      p('Aelith stood in the doorway and did not enter. “Take it and go. The Order will feel that.”'),

      sc('The First Pursuit'),
      p('They were already on the stair when the first horn sounded above them, short and ugly.'),
      p('A figure in gray ash-robes blocked the chapel door, both hands empty, mouth painted with soot.'),
      p('“The exile carries fire,” the priest said. “Lay it down and be forgiven.”'),
      p('“I was forgiven the day they threw me out,” Kaeldros said. “Stand aside.”'),
      p('The priest did not move. Sunspar came free of its cloth with a sound like a struck coal, and the man stepped back from the light as if it had teeth.'),

      ch(EMBER_KING_CHAPTERS[3]),
      sc('Ash on the Wind'),
      p('By midnight The Ashen Order had filled the lower bailey. Their banners were the color of cold hearths.'),
      p('Kaeldros watched from the broken gallery, Sunspar sheathed again, the warmth of it a second pulse against his ribs.'),
      p('Aelith joined him and counted the torches. “Thirty. Perhaps more in the stables.”'),
      p('“They always did like an audience,” he said.'),
      p('Below, a speaker in a bone circlet raised both arms. The courtyard answered with a murmur that was almost a hymn.'),

      sc('The Circlet'),
      p('The speaker’s voice carried cleanly. “Vaelthorn Keep will not be ruled by a returned exile. The Ember King is chosen in ash, not in blood.”'),
      p('Kaeldros leaned on the rail. “He means himself.”'),
      p('“He means whoever survives the rite,” Aelith said. “They will burn a path to the throne hall and call it destiny.”'),
      p('A younger priest looked up, saw them, and pointed. The hymn broke into shouts.'),
      p('“Time to stop watching,” Kaeldros said.'),

      sc('The Cloisters'),
      p('They took the cloisters at a run. Arrows clicked off the columns, too hasty to be aimed.'),
      p('Kaeldros cut a banner-pole and used the fall of cloth to spoil a second volley. Sunspar stayed sheathed. He would not feed the keep a slaughter if he could help it.'),
      p('“Left,” Aelith said. “The old servants’ stair still opens on the hall.”'),
      p('A novice rounded the corner with a censer of live coals. Kaeldros caught the chain and swung the boy into a pillar, hard enough to end the fight and not the life.'),
      p('“Go,” he told the novice. “Tell them the exile is not a rumor.”'),

      sc('The Door to the Hall'),
      p('At the top, Aelith pressed her ear to the door. “They are already inside. The circlet is at the dais.”'),
      p('Kaeldros set his hand on the latch. “Then we are late, not lost.”'),
      p('“If you draw Sunspar in that room, the windows will remember the last burning,” she said.'),
      p('“I know.” He looked at her. “If I fall, take the blade to the ridge and throw it in the river.”'),
      p('“I will not,” Aelith said. “I will take it to someone who can carry a warning better than a corpse.”'),

      ch(EMBER_KING_CHAPTERS[4]),
      sc('The Dais'),
      p('The throne hall of Vaelthorn Keep was longer than memory. Ash had been raked into a pale road from the doors to the dais.'),
      p('The man in the bone circlet stood where a king should sit, and the court of The Ashen Order filled the benches like a congregation.'),
      p('Kaeldros walked the pale road. Sunspar’s wrapped hilt showed at his shoulder. No one stopped him. That, too, was a kind of ritual.'),
      p('“You return to steal a crown you already lost,” the circlet said.'),
      p('“I return to take a blade you had no right to keep,” Kaeldros said. “The crown can wait, or burn. I have not decided.”'),

      sc('The Choice'),
      p('They met on the first step of the dais. The circlet’s knife was obsidian. Sunspar, still half-wrapped, threw gold along the floorboards.'),
      p('“Draw it,” the man whispered. “Become what they named you.”'),
      p('He drew Sunspar the width of a hand and no more. Heat rolled through the hall, and the high windows ticked as if they wanted to crack.'),
      p('“I am not your Ember King,” he said. “I am the man who will not let you make one out of this keep.”'),
      p('The circlet lunged. Steel and volcanic glass met, and the bone crown split on the third exchange.'),

      sc('Dawn'),
      p('Aelith came up the pale road and looked at the cracked circlet, then at Kaeldros’s uncut hand.'),
      p('“You barely drew it,” she said.'),
      p('“Barely was enough.” He sheathed Sunspar and felt the keep settle, as if a held breath had been released.'),
      p('Outside, the first true light found Vaelthorn Keep and made the black walls ordinary stone again.'),
      p('“Stay,” Aelith said. “Not as a king. As a witness. Someone has to tell the truth of this night.”'),
      p('Kaeldros looked toward the ridge where he had stood at dusk. “I will stay until the fires are out,” he said. “After that, we will see if the keep still wants a name for me.”'),
    ] as Array<Segment | Segment[]>).flat()),
  };
}

/** True when a stored book is still the original one-paragraph Ember King sample. */
export function isTinyEmberKingSeed(book: {
  title: string;
  manuscript?: { blocks?: unknown[] };
}): boolean {
  if (!isEmberKingExampleTitle(book.title)) return false;
  const n = book.manuscript?.blocks?.length ?? 0;
  return n <= 8;
}

function looksLikeEmberKingSample(book: {
  title: string;
  manuscript?: { blocks?: Array<{ type?: string; title?: string }> };
}): boolean {
  if (book.title !== EMBER_KING_TITLE_LEGACY) return false;
  const chapters = (book.manuscript?.blocks ?? [])
    .filter((b) => b.type === 'chapter')
    .map((b) => b.title);
  return EMBER_KING_CHAPTERS.every((title) => chapters.includes(title));
}

/** Rename the shipped sample so it is obvious it is not the user's book. */
export function relabelEmberKingExample<T extends { title: string; manuscript?: { blocks?: Array<{ type?: string; title?: string }> } }>(
  book: T,
): T {
  if (book.title !== EMBER_KING_TITLE_LEGACY) return book;
  if (!isTinyEmberKingSeed(book) && !looksLikeEmberKingSample(book)) return book;
  return { ...book, title: EMBER_KING_TITLE };
}

export function relabelEmberKingSeries<T extends { name: string }>(series: T): T {
  if (series.name !== EMBER_KING_SERIES_LEGACY) return series;
  return { ...series, name: EMBER_KING_SERIES };
}
