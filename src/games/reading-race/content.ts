/**
 * Original Reading Race passages. The engine keeps ids, lengths, sentence
 * boundaries and answers; the Screen reads the words. Nothing here is copied
 * from a book, article or website; science and history claims are general
 * and checked against common knowledge.
 */
import type { Locale } from '../contract';

export const MIN_WORDS = 110;
export const MAX_WORDS = 170;
export const QUESTIONS_PER_PASSAGE = 3;
export const OPTIONS_PER_QUESTION = 4;

export type ReadingLevel = 1 | 2 | 3;
export type QuestionKind = 'literal' | 'inference' | 'detail';

export interface Question {
  kind: QuestionKind;
  prompt: string;
  options: [string, string, string, string];
  /** Index of the single correct option. */
  correct: 0 | 1 | 2 | 3;
}

export interface Passage {
  id: string;
  topic: string;
  level: ReadingLevel;
  text: string;
  questions: [Question, Question, Question];
}

/** Split a passage into words. Newlines count as space. */
export function wordList(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Indices where a new sentence begins. A word that ends in `.`, `!` or `?`
 * (optional closing quote) ends a sentence; the next word starts the next one.
 */
export function sentenceStartsOf(words: readonly string[]): number[] {
  const starts = [0];
  for (let i = 0; i < words.length - 1; i++) {
    if (/[.!?]["»”']?$/.test(words[i] ?? '')) starts.push(i + 1);
  }
  return starts;
}

/** Exclusive end index of the first sentence (the topic sentence). */
export function topicEndOf(words: readonly string[]): number {
  const starts = sentenceStartsOf(words);
  return starts[1] ?? words.length;
}

export const PASSAGES: Record<Locale, readonly Passage[]> = {
  en: [
    {
      id: 'extra-bun',
      topic: 'The extra bun',
      level: 1,
      text: `The baker on the corner sold the last bun of each day at half price. One rainy Tuesday she forgot the salt and the dough still rose, pale and bland. A boy in a yellow coat arrived just as she reached for the lock. He counted his coins twice and asked, very quietly, for the last bun. She almost said the batch was spoiled, then wrapped it warm in paper. He sat on the wet step, took a bite, and did not make a face. He waved with crumbs on his sleeve and ran into the rain. That night she mixed a new batch with care and measured the salt twice. She left one extra bun cooling on the rack for whoever might come late. The street smelled of yeast until morning, and she slept well.`,
      questions: [
        { kind: 'literal', prompt: 'What did the baker forget?', options: ['The yeast', 'The salt', 'The paper', 'The lock'], correct: 1 },
        { kind: 'inference', prompt: 'Why did she leave an extra bun on the rack?', options: ['The boy had paid for two', 'She needed to test a new recipe', 'She hoped another late visitor might come', 'The rack would collapse if it was empty'], correct: 2 },
        { kind: 'detail', prompt: 'What colour was the boy’s coat?', options: ['Red', 'Blue', 'Green', 'Yellow'], correct: 3 },
      ],
    },
    {
      id: 'leaves-turn',
      topic: 'Why leaves turn',
      level: 1,
      text: `In summer a leaf looks green because it is full of chlorophyll, the pigment that catches sunlight to make sugar. As the days shorten, many trees stop making chlorophyll and the green fades. Other pigments that were there all along, yellow xanthophylls and orange carotenoids, become easy to see. Some trees also make red anthocyanins in autumn, which can make a maple look as if it is on fire. The tree is not dying of cold. It is sealing the leaf at the stem, pulling useful nutrients back into the twigs, and letting the old leaf fall. The fallen leaves feed the soil as they break down. That is why a quiet park in October can look gold and still be a working tree, not a failing one. Next spring the buds will open and the green will return.`,
      questions: [
        { kind: 'literal', prompt: 'What pigment makes a summer leaf look green?', options: ['Carotene', 'Anthocyanin', 'Chlorophyll', 'Xanthophyll'], correct: 2 },
        { kind: 'inference', prompt: 'Why can a tree look gold in October and still be healthy?', options: ['It has already died and the colour is paint', 'It has sealed the leaves and stored nutrients for spring', 'Gold leaves make more sugar than green ones', 'The cold has frozen the chlorophyll in place'], correct: 1 },
        { kind: 'detail', prompt: 'Which extra pigment can turn a maple red?', options: ['Anthocyanins', 'Salt', 'Chlorophyll only', 'Rust'], correct: 0 },
      ],
    },
    {
      id: 'bike-brake',
      topic: 'How a bicycle brake works',
      level: 1,
      text: `When you squeeze a bicycle’s brake lever, a cable pulls two small pads toward the rim of the wheel. The pads press on the rim. Friction between pad and rim turns motion into heat, and the wheel slows. If the pads are oily, they slip and the stop takes longer. If they are worn thin, you must pull the lever farther to get the same press. A long downhill run can warm the rim until it is uncomfortable to touch, which is a sign that the energy of the descent had to go somewhere. Rim brakes are simple, cheap, and easy to see. They work poorly in heavy rain because water is a lubricant. Disc brakes pinch a metal rotor at the hub instead, which stays drier, but the idea is the same: a pad, a surface, and friction you control with your hand.`,
      questions: [
        { kind: 'literal', prompt: 'What do the brake pads press against on a rim-brake bike?', options: ['The tyre tread', 'The wheel rim', 'The chain', 'The pedal'], correct: 1 },
        { kind: 'inference', prompt: 'Why can a long downhill make the rim warm?', options: ['The sun shines only on rims', 'Air inside the tyre expands into fire', 'Friction turns the bike’s motion into heat', 'The cable melts and drips on the metal'], correct: 2 },
        { kind: 'detail', prompt: 'Why do rim brakes work poorly in heavy rain?', options: ['Rain makes the bell ring', 'Water acts as a lubricant', 'The cable turns to ice', 'Pads grow larger when wet'], correct: 1 },
      ],
    },
    {
      id: 'kettle-steam',
      topic: 'Steam above a kettle',
      level: 1,
      text: `A kettle does not make steam appear from nowhere. Water inside is heated until some of it becomes a gas, water vapour, which is invisible. What you see above the spout is not the vapour itself. It is a cloud of tiny liquid droplets that form when the hot vapour meets cooler air and condenses. Close to the spout there is often a clear gap, because the vapour has not yet cooled enough to form droplets. Farther up, the cloud thins as the droplets mix with air and evaporate again. The same cycle runs in the sky: warm air holds vapour, cool air makes clouds, and clouds can vanish without rain. If you hold a cold spoon in the cloud, drops will gather on the metal. That is condensation you can touch, the same physics as dew on grass in the morning.`,
      questions: [
        { kind: 'literal', prompt: 'What is the visible cloud above a kettle mostly made of?', options: ['Invisible vapour only', 'Tiny liquid water droplets', 'Smoke from the hob', 'Salt crystals'], correct: 1 },
        { kind: 'inference', prompt: 'Why is there often a clear gap just above the spout?', options: ['The kettle blocks the light', 'Vapour there has not yet cooled enough to form droplets', 'Steam cannot exist near metal', 'Air refuses to mix at that height'], correct: 1 },
        { kind: 'detail', prompt: 'What gathers on a cold spoon held in the cloud?', options: ['Soot', 'Sugar', 'Water drops', 'Ice cubes'], correct: 2 },
      ],
    },
    {
      id: 'bee-waggle',
      topic: 'The bee waggle dance',
      level: 2,
      text: `A honeybee that finds a rich patch of flowers can tell her sisters where to go without drawing a map. Inside the dark hive she runs a figure of eight and waggles her abdomen on the straight middle line. The angle of that line, relative to gravity, matches the angle of the food relative to the sun. The length of the waggle run grows with distance. Other bees crowd close and follow her with their antennae. They leave the hive and fly in the direction she described. Researchers have checked this by watching marked bees and placing dishes of syrup at known spots. The dance is not language in the human sense, but it carries direction, distance, and a hint of quality: livelier dances tend to mark richer sources. When the sun moves, the dancer updates the angle. A colony that shares locations this way can harvest a field before the blossoms close.`,
      questions: [
        { kind: 'literal', prompt: 'What does the angle of the waggle run represent?', options: ['The age of the dancer', 'The direction of the food relative to the sun', 'The number of petals on a flower', 'The temperature of the hive'], correct: 1 },
        { kind: 'inference', prompt: 'Why would a livelier dance tend to mark a richer source?', options: ['Tired bees cannot count', 'A stronger signal recruits more foragers to a better patch', 'Lively dances confuse wasps', 'The queen requires entertainment'], correct: 1 },
        { kind: 'detail', prompt: 'What happens to the dance when the sun moves?', options: ['The dancer updates the angle', 'The hive is abandoned', 'Bees wait until night', 'The figure of eight becomes a circle'], correct: 0 },
      ],
    },
    {
      id: 'thermos',
      topic: 'How a thermos keeps soup warm',
      level: 2,
      text: `A thermos flask is a bottle inside a bottle with a gap between them. Air is pumped out of that gap until it is close to a vacuum. Heat moves in three ways: conduction through materials that touch, convection through moving fluids, and radiation as infrared light. A vacuum has almost no air, so conduction and convection across the gap are very weak. The silvered walls reflect radiation back, the way a mirror reflects a lamp. A stopper limits the remaining path at the mouth. Soup poured in at noon can still be hot at dusk because its heat has few routes out. The same flask can keep a drink cold, because heat from the room has few routes in. Drop the flask and you may crack the inner glass, letting air fill the gap; after that it behaves like an ordinary jar. The trick was never magic. It was removing the paths heat likes to travel.`,
      questions: [
        { kind: 'literal', prompt: 'What is in the gap between the two bottles of a thermos?', options: ['Soup', 'A close-to-vacuum space', 'Sand', 'Boiling water'], correct: 1 },
        { kind: 'inference', prompt: 'Why can the same flask keep a drink cold as well as hot?', options: ['Because heat has few routes in or out either way', 'Because cold soup produces a vacuum', 'Because silver paint is chilly', 'Because stoppers freeze on contact'], correct: 0 },
        { kind: 'detail', prompt: 'What do the silvered walls do?', options: ['Absorb all infrared light', 'Reflect radiation back', 'Store extra soup', 'Generate electricity'], correct: 1 },
      ],
    },
    {
      id: 'penny-post',
      topic: 'The penny post',
      level: 2,
      text: `Before 1840, sending a letter in Britain was priced by distance and often paid by the person who received it. Many letters were refused at the door because the fee was a surprise. Rowland Hill argued that postage should be cheap, prepaid, and the same for a standard letter anywhere in the country. In 1840 the Uniform Penny Post began, and the Penny Black stamp went on sale: a small engraved portrait of Queen Victoria that you stuck on the envelope to prove you had paid. The idea spread because it was simple to use and hard to cheat. Mail volume rose quickly. People who had never written a letter began to send news, bills, and affection across counties. The stamp was a receipt you could see. Hill had not invented paper or ink. He had changed the rule of who pays, how much, and when, and that change made a national conversation possible at the price of a penny.`,
      questions: [
        { kind: 'literal', prompt: 'In what year did the Uniform Penny Post begin?', options: ['1740', '1840', '1940', '1640'], correct: 1 },
        { kind: 'inference', prompt: 'Why might cheap prepaid postage increase the number of letters?', options: ['Paper became illegal', 'People were less likely to refuse mail and more willing to write', 'Stamps weighed more than coins', 'Queens required daily reports'], correct: 1 },
        { kind: 'detail', prompt: 'What portrait was on the Penny Black stamp?', options: ['Rowland Hill', 'A lion', 'Queen Victoria', 'A steam engine'], correct: 2 },
      ],
    },
    {
      id: 'tide-pool',
      topic: 'A tide pool after the storm',
      level: 3,
      text: `After a night of high wind the beach looked swept. At low tide the pools in the rocks held a different crowd than the day before. A sea star had been rolled into a basin that was too shallow, and its tube feet searched the stone for a grip. Mussels kept their shells closed against the air. A hermit crab tried a new shell that was still too large and backed out again. Bladderwrack lay in dark straps, its air bladders intact, already drying at the tips. Tide pools are not puddles. They are brief homes at the edge of a huge cold engine, the sea, which returns on a clock you can learn from a tide table. Creatures that live here must survive both drowning and drought twice a day. The storm had only turned the volume up. By afternoon the water was back, cold and salt, and the shallow basin was a pool again, deeper, with the sea star tucked under a ledge.`,
      questions: [
        { kind: 'literal', prompt: 'What was the sea star doing in the shallow basin?', options: ['Eating mussels in the open air', 'Searching the stone for a grip with its tube feet', 'Building a nest of bladderwrack', 'Waiting for rain to freshen the pool'], correct: 1 },
        { kind: 'inference', prompt: 'Why must tide-pool animals survive both drowning and drought?', options: ['The sea covers and uncovers them twice a day', 'Storms last all year', 'Rocks drink the water', 'They migrate to deserts'], correct: 0 },
        { kind: 'detail', prompt: 'What happened to the hermit crab’s new shell?', options: ['It fitted at once', 'It was still too large, so the crab backed out', 'It dissolved in salt', 'A sea star stole it'], correct: 1 },
      ],
    },
    {
      id: 'rag-paper',
      topic: 'Paper from old shirts',
      level: 3,
      text: `For centuries, European paper was not made from trees. It was made from rags: worn shirts, tablecloths, and sails cut up, fermented, and beaten to a pulp of linen and cotton fibres. Those fibres are long and strong. A sheet formed on a wire mould, pressed, and dried could last for hundreds of years without going brown and brittle the way cheap wood-pulp paper often does. Demand for rags was so high that cities ran collection rounds, and wars sometimes made paper scarce because linen went to bandages. In the nineteenth century, wood pulp and chemical bleaching made paper cheap and plentiful, a gift to newspapers and schools. The cost was acidity. Many books from that boom now crumble. Conservators de-acidify pages and store them cool and dry. A rag letter from 1700 can still feel tough in the hand. The lesson is that the fibre you start with, and the chemistry you add, decide how long a sentence can sit on a shelf.`,
      questions: [
        { kind: 'literal', prompt: 'What was European paper made from for centuries, before wood pulp?', options: ['Clay tablets', 'Rags of linen and cotton', 'Dried seaweed', 'Thin leather only'], correct: 1 },
        { kind: 'inference', prompt: 'Why might a rag letter from 1700 still feel tough?', options: ['It was laminated in plastic', 'Long linen and cotton fibres make a durable sheet', 'Ink preserves cloth', 'Seventeenth-century air was colder'], correct: 1 },
        { kind: 'detail', prompt: 'What problem did cheap wood-pulp paper often bring?', options: ['Pages that are too glossy to read', 'Acidity that makes books crumble', 'Ink that cannot dry', 'Paper that cannot be folded'], correct: 1 },
      ],
    },
    {
      id: 'harbour-light',
      topic: 'The harbour light',
      level: 3,
      text: `The keeper climbed the spiral at dusk with a can of oil and a cloth. The lens, a stack of glass prisms, waited at the top. His job was not to invent the light. It was to keep the flame even, the glass clear, and the clockwork that turned the lamp wound before the first ship looked for a blink. Fog had come in low, erasing the town but not the smell of tar. He wiped a fingerprint from a prism. Tonight was not clear. A bell on the point rang for the fog. He felt responsible for a rhythm: wick, wind, wipe, wind again. When the beam finally cut a pale tunnel through the grey, he sat on the stool and listened for engines that might never come. The light went on without him needing to be brave, only careful, the quieter courage the harbour actually needed. Careful was enough. The ships, if they came, would see a blink and not a man.`,
      questions: [
        { kind: 'literal', prompt: 'What did the keeper carry up the spiral at dusk?', options: ['A chart and a bell', 'A can of oil and a cloth', 'A net of glass prisms', 'A clock to sell'], correct: 1 },
        { kind: 'inference', prompt: 'What kind of courage does the passage say the harbour needed?', options: ['A quiet carefulness that keeps a rhythm', 'A charge into the fog with a sword', 'Silence so ships will not hear the bell', 'Leaving the lamp unwound to save oil'], correct: 0 },
        { kind: 'detail', prompt: 'What extra warning ran when fog erased the town?', options: ['A choir in the tower', 'A bell on the point', 'A second keeper shouting', 'Fireworks from the quay'], correct: 1 },
      ],
    },
  ],
  fr: [
    {
      id: 'chat-gare',
      topic: 'Le chat de la gare',
      level: 1,
      text: `Un chat gris vivait sous le banc de la petite gare. Il ne saluait personne et ne demandait rien, mais il s’installait au soleil dès que le premier train était parti. La chef de gare lui laissait une soucoupe près de la porte du bureau, toujours à la même heure. Un mardi, un enfant a posé son cartable trop près de la soucoupe et le chat a reculé sous le banc. L’enfant a attendu, puis a reculé le cartable d’un cran. Le chat est revenu, a lappé un peu, et s’est recouché. Rien d’autre n’est arrivé. Le mercredi, l’enfant a laissé un espace dès le début. La chef de gare a souri sans faire de discours. À la gare, les horaires comptent, et les habitudes aussi. Le chat n’est devenu l’ami de personne. Il a seulement appris qu’un cartable peut bouger, et l’enfant a appris qu’on peut partager un quai sans le remplir.`,
      questions: [
        { kind: 'literal', prompt: 'Où vivait le chat gris ?', options: ['Dans le bureau', 'Sous le banc de la gare', 'Dans le premier train', 'Sur le cartable'], correct: 1 },
        { kind: 'inference', prompt: 'Pourquoi l’enfant recule-t-il son cartable ?', options: ['Pour cacher un sandwich', 'Pour laisser au chat un espace vers la soucoupe', 'Parce que la chef de gare l’a grondé', 'Pour rater le train exprès'], correct: 1 },
        { kind: 'detail', prompt: 'Quand la chef de gare laissait-elle la soucoupe ?', options: ['À une heure toujours différente', 'Seulement le mardi', 'Toujours à la même heure', 'Jamais, c’est l’enfant qui le faisait'], correct: 2 },
      ],
    },
    {
      id: 'ciel-bleu',
      topic: 'Pourquoi le ciel est bleu',
      level: 1,
      text: `Le ciel n’est pas peint. La lumière du soleil est un mélange de couleurs. En traversant l’air, elle rencontre des molécules beaucoup plus petites qu’une longueur d’onde. Ces molécules diffusent surtout le bleu, plus que le rouge. Tes yeux reçoivent donc, de toutes les directions du ciel, davantage de bleu. Le soleil lui-même paraît jaune, parce que le bleu a déjà été un peu dispersé avant d’arriver en ligne droite. Au coucher, la lumière traverse plus d’air. Le bleu se perd en chemin et il reste des oranges et des rouges. Si l’air est chargé de poussière ou de gouttes, le spectacle change encore. Sur la Lune, sans atmosphère, le ciel reste noir même en plein jour, et le soleil est un disque blanc brutal. Le bleu au-dessus de nous n’est donc pas une peinture : c’est de la lumière déviée, encore et encore, par un air que l’on oublie parce qu’on le respire.`,
      questions: [
        { kind: 'literal', prompt: 'Quelle couleur l’air diffuse-t-il surtout ?', options: ['Le rouge', 'Le bleu', 'Le noir', 'Le vert des arbres'], correct: 1 },
        { kind: 'inference', prompt: 'Pourquoi le ciel lunaire reste-t-il noir en plein jour ?', options: ['Parce que le soleil est éteint', 'Parce qu’il n’y a pas d’atmosphère pour diffuser la lumière', 'Parce que la Lune est trop froide', 'Parce que les astronautes portent des lunettes'], correct: 1 },
        { kind: 'detail', prompt: 'Pourquoi le soleil peut-il paraître jaune vu de la Terre ?', options: ['Le bleu a déjà été un peu dispersé avant d’arriver en ligne droite', 'Le soleil est recouvert de peinture', 'L’œil n’aime pas le blanc', 'Les nuages filtrent le jaune seulement'], correct: 0 },
      ],
    },
    {
      id: 'cadenas',
      topic: 'Comment marche un cadenas',
      level: 1,
      text: `Un cadenas à combinaison n’a pas de clé. À l’intérieur, des disques percés d’une encoche tournent avec les chiffres que tu affiches. Tant que les encoches ne sont pas alignées, une tige bloque l’anse : tu peux tirer, rien ne s’ouvre. Quand tu règles la bonne suite de nombres, les encoches forment un petit couloir. La tige peut alors glisser, et l’anse se libère. Un cadenas à clé fait le même travail avec des goupilles de hauteurs différentes. La clé les soulève juste assez pour qu’une ligne de partage apparaisse, et le barillet tourne. Trop haut ou trop bas, ça coince. Ni l’un ni l’autre n’est magique. Ce sont des pièces qui n’acceptent qu’une seule forme, comme une phrase qui n’accepte qu’un seul mot. Si tu notes ta combinaison sur le cadenas, tu as retiré la seule difficulté. Le métal, lui, continue de faire exactement ce pour quoi on l’a taillé.`,
      questions: [
        { kind: 'literal', prompt: 'Que forment les encoches quand la combinaison est la bonne ?', options: ['Un ressort cassé', 'Un petit couloir pour la tige', 'Une clé de secours', 'Un aimant'], correct: 1 },
        { kind: 'inference', prompt: 'Pourquoi noter la combinaison sur le cadenas retire-t-il la difficulté ?', options: ['Parce que le métal fond', 'Parce que le secret n’est plus caché, alors que le mécanisme reste le même', 'Parce que les disques s’usent plus vite', 'Parce que l’anse devient plus légère'], correct: 1 },
        { kind: 'detail', prompt: 'Que fait la clé aux goupilles dans un cadenas à clé ?', options: ['Elle les casse une à une', 'Elle les soulève juste assez pour former une ligne de partage', 'Elle les colle avec de l’huile', 'Elle les remplace par des chiffres'], correct: 1 },
      ],
    },
    {
      id: 'facteur-rural',
      topic: 'La tournée de Lina',
      level: 1,
      text: `Lina chargeait sa sacoche avant le premier coq, par habitude plus que par obligation. La tournée suivait la rivière, puis le plateau, puis les trois fermes trop éloignées pour un bus. Elle connaissait les chiens par leurs noms et les boîtes aux lettres par leurs caprices : celle qui coinçait, celle qui prenait l’eau, celle que le vent refermait trop vite. Un vendredi, une enveloppe n’avait plus d’adresse lisible, seulement un dessin de pommier. Elle a demandé à la boulangère, puis au maire, puis à un enfant qui rentrait de l’école. Le pommier appartenait à la ferme du milieu, celle dont la boîte prenait l’eau. Lina a glissé la lettre bien au fond, sous un petit carton qu’elle gardait pour les jours de pluie. Personne n’a applaudi. Le samedi, une femme a levé la main depuis le verger. Parfois le métier tient dans un dessin, une mémoire de route, et le refus de laisser une enveloppe devenir un mystère.`,
      questions: [
        { kind: 'literal', prompt: 'Que restait-il d’adresse sur l’enveloppe du vendredi ?', options: ['Un numéro de téléphone', 'Un dessin de pommier', 'Le nom du maire', 'Une carte marine'], correct: 1 },
        { kind: 'inference', prompt: 'Pourquoi Lina glisse-t-elle la lettre sous un carton ?', options: ['Pour la cacher au facteur suivant', 'Pour la protéger dans une boîte qui prend l’eau', 'Pour qu’on la croie perdue', 'Pour alourdir la sacoche'], correct: 1 },
        { kind: 'detail', prompt: 'Combien de fermes sont trop éloignées pour un bus ?', options: ['Une', 'Deux', 'Trois', 'Dix'], correct: 2 },
      ],
    },
    {
      id: 'fourmis',
      topic: 'Les fourmis coupeuses de feuilles',
      level: 3,
      text: `Certaines fourmis d’Amérique tropicale coupent des morceaux de feuilles et les portent en file, comme un petit défilé de parasols. Elles ne mangent presque pas la feuille. Dans le nid, elles la mâchent et la mélangent à leur salive pour en faire un jardin de champignons. C’est le champignon qui devient nourriture, une culture que la colonie soigne depuis très longtemps. D’autres fourmis, plus petites, se tiennent parfois sur les fragments pour écarter des mouches parasites. Le nid peut s’étendre en salles souterraines, avec des galeries d’aération. Si un jardin s’infecte, la colonie peut l’abandonner et en fonder un autre. On a longtemps parlé d’instinct comme s’il s’agissait d’une horloge fermée. On voit plutôt une agriculture : des choix, des soins, des déchets triés. La feuille n’est qu’un support. La réussite tient à un partenariat entre un insecte social et un champignon qui ne survit bien que dans ce jardin-là.`,
      questions: [
        { kind: 'literal', prompt: 'Que deviennent surtout les feuilles dans le nid ?', options: ['Un toit contre la pluie', 'Un jardin de champignons', 'Un radeau pour traverser l’eau', 'Une monnaie'], correct: 1 },
        { kind: 'inference', prompt: 'Pourquoi peut-on parler d’agriculture plutôt que d’une simple horloge d’instinct ?', options: ['Parce que la colonie soigne, trie et parfois abandonne un jardin infecté', 'Parce que les fourmis écrivent des manuels', 'Parce que les feuilles poussent dans le nid', 'Parce que les mouches labourent la terre'], correct: 0 },
        { kind: 'detail', prompt: 'Que font parfois les plus petites fourmis sur les fragments ?', options: ['Elles chantent', 'Elles écartent des mouches parasites', 'Elles peignent les feuilles', 'Elles ferment la gare'], correct: 1 },
      ],
    },
    {
      id: 'seve',
      topic: 'La sève au printemps',
      level: 2,
      text: `Au printemps, certains érables laissent couler une sève sucrée si l’on perce le tronc par une journée où les nuits gèlent encore et les après-midi dégelent. Ce n’est pas de l’eau de pluie stockée comme dans une citerne. Pendant l’hiver, l’arbre a gardé des sucres dans le bois et les racines. Quand la température monte, la pression dans les vaisseaux pousse ce liquide vers les plaies, les branches cassées, ou un chalumeau posé par un humain. On fait bouillir longtemps cette sève pour en tirer un sirop, car elle est surtout de l’eau. L’arbre n’offre pas un cadeau. Il déplace des réserves pour nourrir les bourgeons. Une saignée trop forte l’épuise. Les peuples qui ont appris ce rythme le connaissent comme une fenêtre courte, pas comme un robinet. Quand les feuilles s’ouvrent, la sève change, et la collecte s’arrête. Le sucré du sirop est une saison, pas une fontaine.`,
      questions: [
        { kind: 'literal', prompt: 'Pourquoi fait-on longtemps bouillir la sève d’érable ?', options: ['Pour la colorer en vert', 'Parce qu’elle est surtout de l’eau et qu’il faut en tirer un sirop', 'Pour réveiller l’arbre', 'Pour chasser les fourmis'], correct: 1 },
        { kind: 'inference', prompt: 'Pourquoi une saignée trop forte épuise-t-elle l’arbre ?', options: ['Parce qu’on lui retire trop de réserves destinées aux bourgeons', 'Parce que le métal du chalumeau est poison', 'Parce que le froid n’aime pas les trous', 'Parce que les feuilles refusent alors de tomber'], correct: 0 },
        { kind: 'detail', prompt: 'Quel rythme de température favorise l’écoulement ?', options: ['Nuits qui gèlent encore et après-midi qui dégelent', 'Canicule constante', 'Pluie sans fin', 'Neige en plein août'], correct: 0 },
      ],
    },
    {
      id: 'braille',
      topic: 'Le point de Louis Braille',
      level: 2,
      text: `Louis Braille, devenu aveugle enfant après un accident à Coupvray, a repris l’idée d’une écriture par points en relief. Un officier, Charles Barbier, avait proposé un code militaire trop dense pour un doigt. Braille l’a simplifié : six points, deux colonnes de trois, assez pour une lettre que la pulpe peut lire d’un seul pose. Il avait quinze ans quand le système a pris sa forme durable. L’école à Paris n’a pas tout de suite adopté le code des élèves. Lire avec les doigts demandait des livres épais, du papier fort, une patience de compositeur. Pourtant le principe tenait : un alphabet qu’on peut écrire à la main avec une tablette, et qu’on peut imprimer. Aujourd’hui encore, ces six points ouvrent des portes que la synthèse vocale ne remplace pas tout à fait, parce qu’épeler un mot sous le doigt, c’est aussi en voir l’orthographe. Braille n’a pas rendu la vue. Il a rendu une page possible.`,
      questions: [
        { kind: 'literal', prompt: 'Combien de points composent une cellule du braille de Louis Braille ?', options: ['Quatre', 'Six', 'Douze', 'Vingt-six'], correct: 1 },
        { kind: 'inference', prompt: 'Pourquoi une synthèse vocale ne remplace-t-elle pas tout à fait le braille, selon le texte ?', options: ['Parce que les haut-parleurs sont trop chers', 'Parce que lire sous le doigt fait aussi voir l’orthographe d’un mot', 'Parce que Braille a interdit le son', 'Parce que les livres parlés n’existent pas'], correct: 1 },
        { kind: 'detail', prompt: 'Quel âge avait Braille quand le système a pris sa forme durable ?', options: ['Cinq ans', 'Quinze ans', 'Quarante ans', 'Soixante ans'], correct: 1 },
      ],
    },
    {
      id: 'moulin',
      topic: 'Le moulin qui pompe',
      level: 2,
      text: `Dans les pays plats et venteux, on a longtemps vu des moulins dont les ailes ne tournaient pas pour la farine, mais pour l’eau. Le vent pousse les pales. Un axe transmet la rotation jusqu’à une pompe, souvent une tige qui monte et descend dans un tube. À chaque cycle, un clapet retient l’eau déjà montée et un autre en admet un peu plus. C’est lent, régulier, et indépendant d’une rivière proche. On drainait ainsi des polders, ou l’on abreuvait un troupeau loin du puits à seau. Quand le vent tombe, la pompe s’arrête : personne n’a trompé la météo. Les moulins modernes à éolienne de ranch gardent cette franchise mécanique. L’électricité a rendu le geste invisible, caché dans un moteur. Comprendre le moulin, c’est revoir la chaîne : air, pale, axe, clapet, auge. Rien n’apparaît par magie au bout du tuyau. Chaque litre a été levé, un clapot à la fois, par un ciel qui avait de la vitesse à donner.`,
      questions: [
        { kind: 'literal', prompt: 'À quoi servent surtout les ailes de ces moulins-là ?', options: ['À moudre le blé uniquement', 'À pomper de l’eau', 'À mesurer les nuages', 'À faire de l’ombre aux vaches'], correct: 1 },
        { kind: 'inference', prompt: 'Pourquoi la pompe s’arrête-t-elle quand le vent tombe ?', options: ['Parce que l’eau a peur du silence', 'Parce que c’est le vent, et non une ruse, qui fournit le mouvement', 'Parce que les clapets fondent', 'Parce qu’un gardien coupe toujours la tige le soir'], correct: 1 },
        { kind: 'detail', prompt: 'Que retient un clapet à chaque cycle ?', options: ['Le vent dans un sac', 'L’eau déjà montée', 'La farine', 'Les oiseaux'], correct: 1 },
      ],
    },
    {
      id: 'compost',
      topic: 'Le cycle du compost',
      level: 3,
      text: `Un bon tas de compost n’est pas une poubelle oubliée. C’est un chantier où des bactéries, des champignons et de petits invertébrés démontent des restes de cuisine et des déchets de jardin. Ils ont besoin d’un équilibre : trop de feuilles sèches et le tas s’endort ; trop d’épluchures humides et il pourrit en anaérobie, avec une odeur de marécage. L’air compte autant que l’eau. Retourner le tas, c’est offrir de l’oxygène aux microbes qui chauffent le centre. Cette chaleur n’est pas un feu. C’est le métabolisme d’une foule invisible. Assez de semaines plus tard, la matière devient sombre, sent la forêt, et ne ressemble plus à une tomate. On l’étend au pied des plantes. Rien n’a disparu : les atomes ont changé de partenaires. Le carbone part un peu en dioxyde de carbone, l’azote se lie à d’autres molécules, l’eau circule. Composter, ce n’est pas cacher les déchets. C’est refuser qu’ils finissent hors du cycle, dans un trou qui n’a plus de microbes à y faire travailler.`,
      questions: [
        { kind: 'literal', prompt: 'Que se passe-t-il si le tas a trop d’épluchures humides ?', options: ['Il devient du verre', 'Il pourrit en anaérobie, avec une odeur de marécage', 'Il gèle même en été', 'Les plantes parlent'], correct: 1 },
        { kind: 'inference', prompt: 'Pourquoi retourner le tas aide-t-il les microbes qui chauffent le centre ?', options: ['Parce que cela leur offre de l’oxygène', 'Parce que le métal de la fourche est un engrais', 'Parce que le soleil a peur du compost', 'Parce que l’eau s’évapore entièrement d’un coup'], correct: 0 },
        { kind: 'detail', prompt: 'À quoi ressemble la matière une fois le travail fini, selon le texte ?', options: ['À une tomate intacte', 'À quelque chose de sombre qui sent la forêt', 'À du sable de mer', 'À de la fumée bleue'], correct: 1 },
      ],
    },
    {
      id: 'metre',
      topic: 'Inventer le mètre',
      level: 3,
      text: `Pendant la Révolution française, on a voulu une mesure qui ne dépende plus du pied d’un roi ni de la coudée d’un marché. Des savants ont proposé de tirer le mètre d’un morceau de Terre : la dix-millionième partie du quart de méridien entre le pôle et l’équateur. Des équipes ont mesuré un arc entre Dunkerque et Barcelone, avec des triangles posés sur le paysage, malgré la guerre et la méfiance. Le mètre-étalon de platine a ensuite dormi sous double clé, copie d’une idée plus grande que la barre. Plus tard, on a redéfini le mètre par la lumière : la distance qu’elle parcourt dans le vide pendant une fraction de seconde. L’unité a changé de corps, pas de métier. Elle sert encore à ce que deux ateliers ou deux villes puissent dire la même longueur sans se montrer le pouce. Ce n’était pas seulement de la géométrie. C’était le choix d’une mesure commune, assez stable pour qu’un contrat ou un pont tienne d’un bout à l’autre du pays.`,
      questions: [
        { kind: 'literal', prompt: 'D’où voulait-on tirer le mètre au départ ?', options: ['Du pied d’un roi', 'D’un morceau de Terre, un fractionnement du méridien', 'De la longueur d’une baguette de pain', 'Du temps d’une chanson'], correct: 1 },
        { kind: 'inference', prompt: 'Pourquoi redéfinir le mètre par la lumière ne change-t-il pas son métier ?', options: ['Parce que l’unité sert toujours à dire la même longueur d’un lieu à l’autre', 'Parce que la lumière est un métal', 'Parce que Dunkerque a disparu', 'Parce que les ponts refusent le platine'], correct: 0 },
        { kind: 'detail', prompt: 'Quel arc a-t-on mesuré pour fonder cette idée ?', options: ['Entre Rome et Athènes', 'Entre Dunkerque et Barcelone', 'Entre Paris et New York', 'Entre le pôle et la Lune, à pied'], correct: 1 },
      ],
    },
  ],
};
