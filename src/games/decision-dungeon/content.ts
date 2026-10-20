/**
 * Decision Dungeon rooms. English and French share ids, moods, topics, ease
 * and option styles; the situations are original in each language, not
 * sentence-by-sentence translations. The engine scores from styles; the Screen
 * shows the rest of the text.
 */
import type { Locale } from '../contract';

export const STYLES = ['reactive', 'avoidant', 'constructive', 'boundary', 'curious'] as const;
export type StyleTag = (typeof STYLES)[number];

export const MOODS = ['frustration', 'awkward', 'delay', 'disappointment', 'mistake', 'money', 'family'] as const;
export type MoodTag = (typeof MOODS)[number];

export const TOPICS = ['transport', 'work', 'procrastination', 'social', 'failure', 'money', 'family'] as const;
export type Topic = (typeof TOPICS)[number];

export interface Option {
  style: StyleTag;
  label: string;
  /** Short tell shown at difficulty 1–2 so the quality of the door is clearer. */
  cue: string;
  reflection: string;
}

export interface Scenario {
  id: string;
  mood: MoodTag;
  topic: Topic;
  ease: 1 | 2 | 3;
  situation: string;
  reframe: string;
  options: Option[];
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function getScenario(locale: Locale, id: string): Scenario | undefined {
  return SCENARIOS[locale].find((s) => s.id === id);
}

const EN: Scenario[] = [
  {
    id: 's01',
    mood: 'frustration',
    topic: 'transport',
    ease: 1,
    situation:
      'The bus you timed your morning around pulled away just as you reached the stop. The next one is twenty minutes later, and the meeting you hoped to enter calmly will now start without you. Your chest feels tight.',
    reframe: 'What would a kind colleague tell you about being twenty minutes late?',
    options: [
      {
        style: 'reactive',
        label: 'Type a sharp note to the group blaming the city and the timetable.',
        cue: 'snap first',
        reflection:
          'Understandable. The heat is the delay, not you. Naming what you can still do with the next twenty minutes often loosens the knot more than a blast at the timetable.',
      },
      {
        style: 'constructive',
        label: 'Pick the next bus that still works and send a short note that you will be a few minutes behind.',
        cue: 'next small step',
        reflection:
          'You kept the morning moving. A clear note and a new time are ordinary tools. They do not erase the miss, and they do not need to. You still arrive as yourself.',
      },
      {
        style: 'avoidant',
        label: 'Put your headphones on and decide the meeting is no longer your problem.',
        cue: 'step around it',
        reflection:
          'Wanting a pause is fair. If the meeting still needs you, a tiny message now can buy the quiet you wanted without leaving people guessing.',
      },
    ],
  },
  {
    id: 's02',
    mood: 'disappointment',
    topic: 'social',
    ease: 1,
    situation:
      'A friend cancels the walk you had been looking forward to all week, with a one-line message and no new date. The evening is suddenly empty. You reread the line a few times, hoping it will soften.',
    reframe: 'If the roles were reversed, what would you hope they believed about you?',
    options: [
      {
        style: 'reactive',
        label: 'Reply at once that this always happens and you are done making plans.',
        cue: 'hit back',
        reflection:
          'The sting is real. A same-hour verdict often says more about the empty evening than about the friendship. You can feel disappointed and still leave a door ajar.',
      },
      {
        style: 'boundary',
        label: 'Say you are disappointed, and that you would like a new time by the weekend if they still want to come.',
        cue: 'kind and firm',
        reflection:
          'You named the feeling and the request. That is a boundary, not a wall. People can meet it or not; you did not have to swallow the whole evening in silence.',
      },
      {
        style: 'constructive',
        label: 'Answer that you get it, then put a small plan of your own on the same evening so it is not only a hole.',
        cue: 'keep a thread',
        reflection:
          'You gave the friendship room and gave yourself a next step. The walk can be rescheduled. Tonight does not have to be a referendum on whether you matter.',
      },
    ],
  },
  {
    id: 's03',
    mood: 'delay',
    topic: 'procrastination',
    ease: 1,
    situation:
      'The form has sat on the kitchen table for the third day. It would take twelve minutes. Each time you pass it you feel a small pinch, then you wash a cup or check a phone instead, as if the pinch might leave on its own.',
    reframe: 'What is the smallest slice of this form you could finish before the kettle boils?',
    options: [
      {
        style: 'avoidant',
        label: 'Move the form to a drawer so you do not have to see it until next week.',
        cue: 'hide the pinch',
        reflection:
          'Out of sight rarely ends the pinch; it just changes rooms. A drawer can be a rest if you also name a time you will open it. Otherwise the third day becomes a fourth.',
      },
      {
        style: 'constructive',
        label: 'Set a twelve-minute timer, fill what you can, and stop when it rings even if a line is left.',
        cue: 'start tiny',
        reflection:
          'A timer turns a fog into a door you can walk through. Stopping on purpose is not failure; it is how a dreaded page becomes an ordinary one.',
      },
      {
        style: 'curious',
        label: 'Write down what you are afraid the form will ask, then open it and check whether that fear is even there.',
        cue: 'ask the fear',
        reflection:
          'Naming the imagined snag often shrinks it. Curiosity is a gentle way in. You can still fill a box or two once you have seen the real page.',
      },
    ],
  },
  {
    id: 's04',
    mood: 'mistake',
    topic: 'work',
    ease: 1,
    situation:
      'You sent a client the draft with yesterday’s figures still in the table. They have not replied. You noticed the slip while making tea. Your face is hot and you keep replaying the send button as if you could unsay it.',
    reframe: 'How would you talk to a teammate who had sent the same draft?',
    options: [
      {
        style: 'reactive',
        label: 'Send a flurry of apologies and a joke at your own expense before they even answer.',
        cue: 'pile on yourself',
        reflection:
          'The urge to get ahead of shame is common. A short correction is usually enough. You do not have to put on a show to be allowed a small error.',
      },
      {
        style: 'constructive',
        label: 'Send the right file with one calm line naming the slip and the corrected numbers.',
        cue: 'fix and name',
        reflection:
          'A clean correction treats you and the client as adults. Most people remember the repair more than the dent. You already did the hard part: you noticed.',
      },
      {
        style: 'avoidant',
        label: 'Wait and hope they never look at the table closely.',
        cue: 'hope it passes',
        reflection:
          'Hoping is a rest, not a plan. If the figures matter, a quiet correction now is kinder to future-you than a week of checking their reply for weather.',
      },
    ],
  },
  {
    id: 's05',
    mood: 'awkward',
    topic: 'social',
    ease: 2,
    situation:
      'The group chat goes quiet after you share a story you thought was funny. Three people were typing, then nothing. A minute later someone posts a photo of a sandwich. You feel yourself shrinking behind the screen.',
    reframe: 'What else could a quiet thread mean besides a verdict on you?',
    options: [
      {
        style: 'reactive',
        label: 'Add a cutting follow-up so they know you noticed the silence.',
        cue: 'poke the quiet',
        reflection:
          'The silence stung. A poke often asks the room to soothe you at once. You can notice the shrink without handing the whole thread to it.',
      },
      {
        style: 'curious',
        label: 'Ask a genuine question about the sandwich photo and let your story sit without a defence.',
        cue: 'stay interested',
        reflection:
          'Turning toward what is here keeps you in the room. Threads skip and land for dull reasons. Curiosity is a way to belong without auditioning.',
      },
      {
        style: 'constructive',
        label: 'Leave the chat for now, and later send the story to one person who would actually enjoy it.',
        cue: 'choose a better door',
        reflection:
          'You did not have to win the whole group in one beat. A better listener is a real next step. The sandwich is not a trial.',
      },
      {
        style: 'avoidant',
        label: 'Mute the chat for a week and tell yourself you will never share there again.',
        cue: 'disappear',
        reflection:
          'A mute can be a kindness when you are raw. Making it a forever rule turns one skipped joke into a closed street. You can return when the heat cools.',
      },
    ],
  },
  {
    id: 's06',
    mood: 'money',
    topic: 'money',
    ease: 2,
    situation:
      'An unexpected fee shows up on the statement, small enough to feel silly about and large enough to sour the morning. You did not budget for it. The line item has a name you do not recognise.',
    reframe: 'If this were a friend’s statement, what is the first calm question you would ask?',
    options: [
      {
        style: 'reactive',
        label: 'Call the number on the statement ready to argue with whoever picks up.',
        cue: 'start hot',
        reflection:
          'Anger is information: something landed off the plan. A call can still be useful if you lead with the line item rather than with the person who answered.',
      },
      {
        style: 'constructive',
        label: 'Write down the amount, find the original terms, then send one clear question about the fee.',
        cue: 'get the facts',
        reflection:
          'Paper before heat. A named amount and a single question often get a real answer. You treated your future self like someone worth a few minutes.',
      },
      {
        style: 'avoidant',
        label: 'Close the banking app and tell yourself it is not worth the hassle.',
        cue: 'look away',
        reflection:
          'Small fees love a closed app. Looking away soothes the morning and quietly trains the next fee. You can still choose a ten-minute look later today.',
      },
    ],
  },
  {
    id: 's07',
    mood: 'family',
    topic: 'family',
    ease: 2,
    situation:
      'The sink is full again and it was supposed to be someone else’s turn. You have already done it twice this week. A familiar heat rises as you hear them humming in the other room, not unkind, just elsewhere.',
    reframe: 'What request would make this week easier, said in one ordinary sentence?',
    options: [
      {
        style: 'reactive',
        label: 'Wash everything loudly and then list every chore you have done since Monday.',
        cue: 'keep score out loud',
        reflection:
          'The list is trying to be seen. Scorekeeping often arrives as a wave. You can still want fairness without making the sink a courtroom.',
      },
      {
        style: 'boundary',
        label: 'Leave the sink, and say you will not do a third round unless you agree a new split today.',
        cue: 'stop the extra round',
        reflection:
          'A paused sponge can be a sentence. You named a limit without inventing a villain. The humming person can join the plan once they hear it.',
      },
      {
        style: 'constructive',
        label: 'Ask if they can take the sink after their song, and put a simple rotation on the fridge.',
        cue: 'make a small plan',
        reflection:
          'A rotation is dull in the best way. You turned heat into a tool the house can see. Humming and fairness can share a kitchen.',
      },
    ],
  },
  {
    id: 's08',
    mood: 'frustration',
    topic: 'work',
    ease: 2,
    situation:
      'A colleague’s message is two lines and blunt: the file is late, again. No hello. You were waiting on someone else, and you had a draft ready. The tone lands like a door closing on your fingers.',
    reframe: 'What is the one fact you wish they had, and how short can that fact be?',
    options: [
      {
        style: 'reactive',
        label: 'Reply in the same blunt tone and copy in someone senior so they feel it.',
        cue: 'match the heat',
        reflection:
          'Matching heat is a fast kind of justice and a slow kind of mess. The late file is still the work. You can be clear without opening a second front.',
      },
      {
        style: 'boundary',
        label: 'Answer the file question, and add that you need a greeting and a real deadline next time, not a jab.',
        cue: 'name the tone',
        reflection:
          'You did the work and you named the manner. That is a boundary at a desk. People can adjust; you did not have to pretend the jab was fine.',
      },
      {
        style: 'avoidant',
        label: 'Leave the message unread so you do not have to feel it today.',
        cue: 'delay the sting',
        reflection:
          'Unread is a shelter. The file still sits there. A later you will meet the same two lines; a one-line plan now can make that meeting smaller.',
      },
      {
        style: 'constructive',
        label: 'Send the draft with the missing piece named, and a time you can finish the rest.',
        cue: 'answer the work',
        reflection:
          'You answered the actual request. Tone can be a later conversation. A named time is a door; it lets both of you put the heat down.',
      },
    ],
  },
  {
    id: 's09',
    mood: 'disappointment',
    topic: 'social',
    ease: 2,
    situation:
      'Photos from a lunch appear in the shared album. You were not invited, though you work with most of the people in the frame. Nobody tagged you. The afternoon feels oddly loud in a quiet room.',
    reframe: 'What story are you telling about the empty chair, and is it the only one?',
    options: [
      {
        style: 'reactive',
        label: 'Post a pointed joke under the album so they know you saw it.',
        cue: 'make them wince',
        reflection:
          'The joke would carry the sting into their day. It might even work. It would also glue you to the hurt. You can want to be included without turning the album into a trap.',
      },
      {
        style: 'curious',
        label: 'Ask one person, plainly, whether it was a last-minute table and whether there is room next time.',
        cue: 'check the story',
        reflection:
          'A plain question beats a novel about your worth. Sometimes it was a tiny table. Sometimes it was a miss. Either way you get a fact instead of a fog.',
      },
      {
        style: 'constructive',
        label: 'Suggest a coffee with two of them this week, on a day you can actually come.',
        cue: 'make a next seat',
        reflection:
          'You built a seat instead of staring at the photo. Not every lunch will include you. You can still practise asking for the next small table.',
      },
    ],
  },
  {
    id: 's10',
    mood: 'delay',
    topic: 'procrastination',
    ease: 2,
    situation:
      'The inbox is a pile you have not opened since Monday. You know two notes need a reply. Each unlock of the phone becomes a tour of other apps. The unread badge has become a small weather system.',
    reframe: 'Which single message, if answered, would make the pile feel less like weather?',
    options: [
      {
        style: 'avoidant',
        label: 'Turn off the badge and tell yourself you will have a proper inbox day on Sunday.',
        cue: 'postpone the pile',
        reflection:
          'Sunday is a kind story. Piles grow in the dark. A badge off can be rest if one real reply still happens today. Otherwise the weather stays.',
      },
      {
        style: 'reactive',
        label: 'Open everything at once and fire short, irritated replies to clear the number.',
        cue: 'blast through',
        reflection:
          'Speed can be a kind of panic. Clearing a number is not the same as answering people. You can still choose one note and give it a human sentence.',
      },
      {
        style: 'constructive',
        label: 'Pick the two notes that matter, answer them in ten minutes, and leave the rest closed.',
        cue: 'two, then stop',
        reflection:
          'Two notes is a door. Stopping is part of the skill. The badge can wait; the people behind the two notes cannot feel the whole pile.',
      },
      {
        style: 'curious',
        label: 'Before opening anything, write what you expect to find, then open one message and compare.',
        cue: 'test the dread',
        reflection:
          'Dread writes fiction. One real message is data. Curiosity lets you in without promising to finish the mountain before lunch.',
      },
    ],
  },
  {
    id: 's11',
    mood: 'mistake',
    topic: 'failure',
    ease: 3,
    situation:
      'You drop a plate in a small cafe. It does not break loudly, but it breaks. A few heads turn. The staff are already coming over with a brush. Your ears burn and you want the floor to open a polite hatch.',
    reframe: 'In two days, how big will this plate be in anyone else’s week?',
    options: [
      {
        style: 'reactive',
        label: 'Over-apologise, offer to pay for more than the plate, and laugh too hard at yourself.',
        cue: 'make it a show',
        reflection:
          'The show is trying to buy safety. A plate is already being swept. You can be sorry in one sentence and let the room return to its coffee.',
      },
      {
        style: 'avoidant',
        label: 'Leave a note of cash and step out before anyone can talk to you.',
        cue: 'vanish',
        reflection:
          'Leaving skips the blush and also skips the ordinary repair. Most rooms are built for a dropped plate. You are allowed to stay and be a person who dropped one.',
      },
      {
        style: 'constructive',
        label: 'Help with the sweep if they want, pay for the plate, and order what you came for.',
        cue: 'repair, then stay',
        reflection:
          'Staying is the brave dull thing. A paid plate and a finished tea tell your nervous system the story ended. The heads that turned have already gone back to their cups.',
      },
      {
        style: 'curious',
        label: 'Ask the staff what they usually do, and follow that instead of inventing a punishment.',
        cue: 'ask the house rule',
        reflection:
          'Houses have ordinary rules for mess. Asking puts you back in the adult world. You do not have to write a harsher one in your head.',
      },
    ],
  },
  {
    id: 's12',
    mood: 'awkward',
    topic: 'social',
    ease: 3,
    situation:
      'You use the wrong name for someone you have met twice. They correct you kindly. Your mind goes blank, then noisy. The rest of the greeting is still sitting in your mouth, unfinished.',
    reframe: 'What would you want if someone used the wrong name for you in a doorway?',
    options: [
      {
        style: 'avoidant',
        label: 'Laugh it off, skip the rest of the greeting, and avoid them for the rest of the event.',
        cue: 'leave the hallway',
        reflection:
          'Avoiding them protects the blush and stranded the greeting. Most people remember the correction, not the miss. You can still finish the hello later.',
      },
      {
        style: 'reactive',
        label: 'Tell a long story about how bad you are with names so they will comfort you.',
        cue: 'make it about you',
        reflection:
          'The story asks them to nurse your embarrassment. A name is a small thing to repair. You can let them keep their kindness without hiring them as your soother.',
      },
      {
        style: 'boundary',
        label: 'Thank them for the correction, say the right name once, and do not turn it into a performance.',
        cue: 'correct and continue',
        reflection:
          'One thanks, one right name, onward. That is respect without a parade. You also modelled how you hope to be corrected: briefly, then back to the day.',
      },
      {
        style: 'constructive',
        label: 'Use the right name in the next sentence, and write it down when you are out of the doorway.',
        cue: 'lock it in',
        reflection:
          'Practice in the next sentence is how a name becomes yours to keep. A note in your pocket is a kindness to future-you and to them.',
      },
    ],
  },
  {
    id: 's13',
    mood: 'money',
    topic: 'money',
    ease: 3,
    situation:
      'The shared bill lands and you ordered less than the others. Someone suggests splitting evenly because it is easier. You can afford the extra, and you can also feel the small unfairness humming under the table.',
    reframe: 'What sentence would keep both the friendship and the numbers honest?',
    options: [
      {
        style: 'reactive',
        label: 'Make a joke about always paying for other people’s pudding until the table goes quiet.',
        cue: 'sting with humour',
        reflection:
          'The joke told the truth sideways and asked the table to feel it. Humour can open a door or nail it shut. You still get to want a fairer split.',
      },
      {
        style: 'avoidant',
        label: 'Pay the even split, smile, and decide you will not come next time.',
        cue: 'smile and skip next',
        reflection:
          'A smile can be a bill you pay twice: once in money, once in a quiet exit. You can come next time and still ask for a simpler split up front.',
      },
      {
        style: 'constructive',
        label: 'Offer to pay your items plus a share of the tip, and let the rest settle the remainder.',
        cue: 'name a fair split',
        reflection:
          'A specific offer is easier to meet than a mood. You kept the evening and the numbers in the same room. Fairness does not have to be a scene.',
      },
      {
        style: 'boundary',
        label: 'Say you are happy to share tips and extras, not the dishes you did not order.',
        cue: 'draw the line kindly',
        reflection:
          'You said yes to some sharing and no to the rest. That is a boundary with a smile still on it. Friends can handle a clear number.',
      },
    ],
  },
  {
    id: 's14',
    mood: 'family',
    topic: 'family',
    ease: 3,
    situation:
      'Two relatives want you on the same evening: a call you promised last week, and a visit that would help with a school run. You said maybe to both. Your calendar now looks like a knot, and both of them are waiting.',
    reframe: 'If you could keep only one promise tonight, which one still feels like you?',
    options: [
      {
        style: 'reactive',
        label: 'Send both a harried message that nobody understands how busy you are.',
        cue: 'show the knot',
        reflection:
          'The knot is real. Showing it as blame rarely frees a hand. You can still pick one yes and one later without a weather report about your whole life.',
      },
      {
        style: 'avoidant',
        label: 'Ignore both threads until the evening has passed and then apologise in general terms.',
        cue: 'let the clock decide',
        reflection:
          'The clock will decide, and both people will feel dropped. A late general sorry is heavier than one honest reshuffle now. You are allowed to choose.',
      },
      {
        style: 'boundary',
        label: 'Keep the promise you already made, and offer the other person a specific time this week.',
        cue: 'one yes, one later',
        reflection:
          'A kept promise is a kind of rest. The other person gets a real slot, not a fog. You did not have to split yourself down the middle of one night.',
      },
      {
        style: 'constructive',
        label: 'Look at the actual minutes, pick the plan that fits, and tell both people the same simple schedule.',
        cue: 'put times on it',
        reflection:
          'Minutes are kinder than guilt. A shared schedule lets everyone plan. You treated your evening like something that can be designed, not only survived.',
      },
    ],
  },
  {
    id: 's15',
    mood: 'frustration',
    topic: 'transport',
    ease: 3,
    situation:
      'The tram skips your stop without opening. You were at the door. The driver points ahead as if this is obvious. You will now walk a hill you did not dress for, holding a bag that has become heavier in the last ten seconds.',
    reframe: 'What is still in your control between this hill and the door you were going to?',
    options: [
      {
        style: 'reactive',
        label: 'Hammer the glass and shout a rating of the service at the closed doors.',
        cue: 'punish the tram',
        reflection:
          'The tram cannot hear a review. Your body can. A shout spends energy you may want for the hill. The skip was rude; you still get to choose the next ten minutes.',
      },
      {
        style: 'constructive',
        label: 'Check the next tram, then start the hill at a pace you can hold, and message if you will be late.',
        cue: 'walk the plan',
        reflection:
          'A pace and a message turn a snub into a route. You do not have to like the hill to finish it. Future-you will be glad you moved.',
      },
      {
        style: 'curious',
        label: 'Ask a person on the platform whether this skip is a known change, then decide with that fact.',
        cue: 'get the pattern',
        reflection:
          'Sometimes it is a one-off; sometimes a new pattern. Asking keeps you in the adult world of information. You can still walk, wait, or write a calm note later.',
      },
      {
        style: 'avoidant',
        label: 'Sit on the bench and tell yourself you will go home instead, even if that undoes the afternoon.',
        cue: 'abandon the errand',
        reflection:
          'A bench is allowed. Cancelling the whole afternoon because a door stayed shut hands the tram your day. You can rest one minute and still choose the hill.',
      },
    ],
  },
  {
    id: 's16',
    mood: 'delay',
    topic: 'work',
    ease: 3,
    situation:
      'The meeting before yours ran over. People are still talking in the seats you booked. Your notes are in your hands. A clock you cannot stop is eating the time you needed to be clear. Nobody has looked up.',
    reframe: 'What is the smallest interruption that would protect the next half hour for everyone?',
    options: [
      {
        style: 'avoidant',
        label: 'Wait in the corridor until they finish, even if that leaves you ten minutes for your own session.',
        cue: 'yield the room',
        reflection:
          'Politeness can erase a plan. The corridor feels safe and costs the thing you came to do. You can still be courteous and knock.',
      },
      {
        style: 'reactive',
        label: 'Walk in talking, stack your papers down, and let them feel the overrun.',
        cue: 'take the room back',
        reflection:
          'The overrun was not yours. Taking the room as a shove makes a second mess. You can enter and still leave people their dignity.',
      },
      {
        style: 'constructive',
        label: 'Knock, name your start time, and offer them two minutes to wrap or a new room if you know one.',
        cue: 'offer a wrap',
        reflection:
          'A named time plus an offer is how rooms change hands. You protected your session without turning the last meeting into an enemy.',
      },
      {
        style: 'boundary',
        label: 'Say you will begin in two minutes in this room, and start on time even if a few of them are still packing.',
        cue: 'keep your slot',
        reflection:
          'Your slot is a real thing. Two minutes is courtesy; giving away the rest is a habit. People can pack while you open a note. That is allowed.',
      },
    ],
  },
  {
    id: 's17',
    mood: 'disappointment',
    topic: 'failure',
    ease: 3,
    situation:
      'The cake you baked for a small gathering comes out of the tin in two sad pieces. It still tastes fine. You had pictured a neat slice on a plate. Guests are due in forty minutes and the kitchen smells like sugar and defeat.',
    reframe: 'What would make this cake still a gift, even in pieces?',
    options: [
      {
        style: 'reactive',
        label: 'Throw the pieces away and buy something glossy so nobody knows you tried.',
        cue: 'hide the try',
        reflection:
          'Binning a fine cake to hide effort is a hard bargain. People came for you. A glossy box is optional; the try is already the gift.',
      },
      {
        style: 'avoidant',
        label: 'Pretend you never meant to bake, and serve only the shop biscuits you have at the back.',
        cue: 'deny the cake',
        reflection:
          'Denying the bake protects the picture in your head and wastes the sugar. You can serve pieces and still be a host. The story can be kind.',
      },
      {
        style: 'curious',
        label: 'Ask a friend who is good with food what they would do with two pieces and forty minutes.',
        cue: 'borrow a brain',
        reflection:
          'Borrowing a brain is not a failure of yours. Forty minutes is plenty for a crumble, a trifle, or a pile with cream. Curiosity keeps the evening edible.',
      },
      {
        style: 'constructive',
        label: 'Turn the pieces into bowls with cream and fruit, and tell the story as a happy mess.',
        cue: 'serve the mess',
        reflection:
          'A bowl is a plate with mercy. You kept the gift and dropped the performance. Guests remember the table more than the tin.',
      },
    ],
  },
  {
    id: 's18',
    mood: 'awkward',
    topic: 'social',
    ease: 3,
    situation:
      'You realise you have been talking for a long stretch at the table. Two faces look politely tired. You were nervous and the story grew extra rooms. There is a pause that belongs to someone else, and you are still in it.',
    reframe: 'What would handing the pause back look like in one short sentence?',
    options: [
      {
        style: 'avoidant',
        label: 'Stop mid-sentence, stare at your plate, and barely speak for the rest of the meal.',
        cue: 'go silent',
        reflection:
          'Silence after a long story can feel like a penance. The table does not need you gone; it needs a turn. You can return as a listener without disappearing.',
      },
      {
        style: 'boundary',
        label: 'Say you have taken enough air, and ask a real question of the quietest person.',
        cue: 'hand the floor over',
        reflection:
          'Naming the air and passing it is a social boundary you use on yourself. That is skill, not shame. The quietest person might have been waiting.',
      },
      {
        style: 'constructive',
        label: 'Land the story in one line, laugh at the extra rooms, and invite someone else’s tale.',
        cue: 'land, then invite',
        reflection:
          'A landing is a kindness. Extra rooms can be a joke you share, not a hole you fall into. You stayed at the table as a person among people.',
      },
      {
        style: 'reactive',
        label: 'Keep going faster so the pause cannot arrive, and add one more detail they did not ask for.',
        cue: 'outrun the quiet',
        reflection:
          'Speed is a way to not feel the pause. The tired faces are information, not an attack. You can still stop. The story will keep.',
      },
    ],
  },
];

const FR: Scenario[] = [
  {
    id: 's01',
    mood: 'frustration',
    topic: 'transport',
    ease: 1,
    situation:
      "Le métro se referme sous tes yeux, le suivant est dans un quart d'heure, et tu avais dit que tu arriverais pile pour le café d'équipe. Tes épaules se serrent. Le quai sent le frein et le matin trop juste.",
    reframe: "Que te dirait un collègue bienveillant sur un retard d'un quart d'heure ?",
    options: [
      {
        style: 'reactive',
        label: "Envoie un message sec au groupe pour blâmer la ligne et la ville entière.",
        cue: 'réponds à chaud',
        reflection:
          "C'est compréhensible. La chaleur vient du quai, pas de toi. Nommer ce que tu peux encore faire de ce quart d'heure desserre souvent plus le nœud qu'un coup de colère au réseau.",
      },
      {
        style: 'constructive',
        label: "Regarde le prochain passage qui tient encore, et préviens en une ligne que tu auras quelques minutes de décalage.",
        cue: 'petit pas suivant',
        reflection:
          "Tu as gardé la matinée en mouvement. Un horaire et un mot clair sont des outils simples. Ils n'effacent pas le métro manqué, et ils n'ont pas à le faire.",
      },
      {
        style: 'avoidant',
        label: "Enfile tes écouteurs et décide que le café d'équipe n'est plus ton affaire.",
        cue: 'contourne',
        reflection:
          "Envie de pause, c'est légitime. Si l'équipe a encore besoin de toi, un tout petit message peut acheter le calme sans laisser les autres dans le flou.",
      },
    ],
  },
  {
    id: 's02',
    mood: 'disappointment',
    topic: 'social',
    ease: 1,
    situation:
      "Un ami annule la balade prévue depuis une semaine, en une phrase, sans proposer d'autre jour. La soirée se vide d'un coup. Tu relis le message en espérant qu'il s'adoucisse tout seul.",
    reframe: "Si les rôles étaient inversés, qu'est-ce que tu voudrais qu'on croie de toi ?",
    options: [
      {
        style: 'reactive',
        label: "Réponds tout de suite que ça arrive toujours et que tu arrêtes de proposer des plans.",
        cue: 'rends le coup',
        reflection:
          "La pique est vraie. Un verdict dans l'heure parle souvent du soir vide plus que de l'amitié. Tu peux être déçu et laisser une porte entrouverte.",
      },
      {
        style: 'boundary',
        label: "Dis que tu es déçu, et que tu aimerais une nouvelle date d'ici le week-end s'ils veulent toujours venir.",
        cue: 'ferme et gentil',
        reflection:
          "Tu as nommé le ressenti et la demande. C'est une limite, pas un mur. Les gens peuvent s'y tenir ou non ; tu n'as pas eu à avaler toute la soirée en silence.",
      },
      {
        style: 'constructive',
        label: "Réponds que tu comprends, puis invente un tout petit plan pour toi, pour que le soir ne soit pas qu'un trou.",
        cue: 'garde un fil',
        reflection:
          "Tu as laissé de l'air à l'amitié et un pas à toi-même. La balade peut se reporter. Ce soir n'a pas à juger si tu comptes.",
      },
    ],
  },
  {
    id: 's03',
    mood: 'delay',
    topic: 'procrastination',
    ease: 1,
    situation:
      "Le formulaire traîne sur la table depuis trois jours. Il te prendrait douze minutes. Chaque fois que tu passes devant, tu sens un pincement, puis tu laves une tasse ou tu regardes le téléphone, comme si le pincement pouvait partir tout seul.",
    reframe: 'Quelle plus petite case pourrais-tu remplir avant que la bouilloire chante ?',
    options: [
      {
        style: 'avoidant',
        label: "Range le formulaire dans un tiroir pour ne plus le voir avant la semaine prochaine.",
        cue: 'cache le pincement',
        reflection:
          "Hors de vue, le pincement change juste de pièce. Un tiroir peut être un repos si tu nommes aussi l'heure où tu l'ouvriras. Sinon le troisième jour en devient un quatrième.",
      },
      {
        style: 'constructive',
        label: "Lance un minuteur de douze minutes, remplis ce que tu peux, et arrête-toi même s'il reste une ligne.",
        cue: 'commence petit',
        reflection:
          "Un minuteur transforme le brouillard en porte. S'arrêter exprès n'est pas un échec ; c'est comme ça qu'une page redoutée redevient une page ordinaire.",
      },
      {
        style: 'curious',
        label: "Écris ce que tu as peur que le formulaire demande, puis ouvre-le pour voir si cette peur est vraiment là.",
        cue: 'interroge la peur',
        reflection:
          "Nommer l'accroche imaginaire la réduit souvent. La curiosité est une entrée douce. Tu pourras encore cocher deux cases une fois la vraie page sous les yeux.",
      },
    ],
  },
  {
    id: 's04',
    mood: 'mistake',
    topic: 'work',
    ease: 1,
    situation:
      "Tu as envoyé au client le brouillon avec les chiffres d'hier encore dans le tableau. Il n'a pas répondu. Tu t'en aperçois en préparant le thé. Tu as chaud aux joues et tu revois la touche envoyer comme si tu pouvais la défaire.",
    reframe: 'Comment parlerais-tu à un collègue qui aurait envoyé le même brouillon ?',
    options: [
      {
        style: 'reactive',
        label: "Envoie une pluie d'excuses et une blague contre toi-même avant même qu'il réponde.",
        cue: 'trouve-toi trop',
        reflection:
          "L'envie de devancer la honte est fréquente. Une correction courte suffit le plus souvent. Tu n'as pas à monter un spectacle pour avoir le droit à une petite erreur.",
      },
      {
        style: 'constructive',
        label: 'Envoie le bon fichier avec une phrase calme qui nomme la glissade et les chiffres corrigés.',
        cue: 'répare et nomme',
        reflection:
          "Une correction nette vous traite, toi et le client, comme des adultes. La plupart des gens retiennent la réparation plus que la bosse. Le plus dur, tu l'as déjà fait : tu as vu.",
      },
      {
        style: 'avoidant',
        label: "Attends en espérant qu'ils ne regarderont jamais le tableau de près.",
        cue: 'laisse passer',
        reflection:
          "Espérer est un repos, pas un plan. Si les chiffres comptent, une correction discrète maintenant est plus douce pour le toi de demain qu'une semaine à scruter leur réponse.",
      },
    ],
  },
  {
    id: 's05',
    mood: 'awkward',
    topic: 'social',
    ease: 2,
    situation:
      "Le groupe se tait après l'histoire que tu croyais drôle. Trois personnes étaient en train d'écrire, puis plus rien. Une minute plus tard, quelqu'un poste la photo d'un sandwich. Tu te sens rétrécir derrière l'écran.",
    reframe: "Qu'est-ce qu'un fil silencieux peut vouloir dire, à part un verdict sur toi ?",
    options: [
      {
        style: 'reactive',
        label: "Ajoute une pique pour qu'ils sachent que tu as vu le silence.",
        cue: 'pique le calme',
        reflection:
          "Le silence a piqué. Une pique demande souvent à la pièce de te soigner tout de suite. Tu peux sentir le rétrécissement sans lui donner tout le fil.",
      },
      {
        style: 'curious',
        label: "Pose une vraie question sur la photo du sandwich et laisse ton histoire reposer sans te défendre.",
        cue: 'reste curieux',
        reflection:
          "Se tourner vers ce qui est là te garde dans la pièce. Les fils sautent pour des raisons plates. La curiosité est une façon d'appartenir sans passer une audition.",
      },
      {
        style: 'constructive',
        label: "Laisse le groupe pour l'instant, et envoie plus tard l'histoire à une personne qui l'aimerait vraiment.",
        cue: 'choisis une meilleure porte',
        reflection:
          "Tu n'avais pas à gagner tout le groupe en un temps. Un meilleur auditeur est un vrai pas. Le sandwich n'est pas un procès.",
      },
      {
        style: 'avoidant',
        label: "Coupe le groupe une semaine et te promets de ne plus rien y partager.",
        cue: 'disparais',
        reflection:
          "Couper peut être une douceur quand tu es à vif. En faire une règle pour toujours transforme une blague sautée en rue fermée. Tu pourras revenir quand la chaleur retombe.",
      },
    ],
  },
  {
    id: 's06',
    mood: 'money',
    topic: 'money',
    ease: 2,
    situation:
      "Un frais inattendu apparaît sur le relevé, assez petit pour te sentir ridicule d'en parler, assez grand pour gâcher la matinée. Tu ne l'avais pas prévu. La ligne porte un nom que tu ne reconnais pas.",
    reframe: "Si c'était le relevé d'un ami, quelle serait ta première question calme ?",
    options: [
      {
        style: 'reactive',
        label: "Appelle le numéro du relevé déjà prêt à t'engueuler avec la personne au bout.",
        cue: 'pars à chaud',
        reflection:
          "La colère informe : quelque chose est sorti du plan. Un appel reste utile si tu commences par la ligne, pas par la personne qui a décroché.",
      },
      {
        style: 'constructive',
        label: 'Note le montant, retrouve le contrat, puis envoie une seule question claire sur ce frais.',
        cue: 'cherche les faits',
        reflection:
          "Le papier avant la chaleur. Un montant nommé et une question unique obtiennent souvent une vraie réponse. Tu as traité ton futur toi comme quelqu'un qui mérite quelques minutes.",
      },
      {
        style: 'avoidant',
        label: "Ferme l'appli et te dis que ça ne vaut pas l'effort.",
        cue: 'détourne les yeux',
        reflection:
          "Les petits frais aiment une appli fermée. Détourner les yeux calme la matinée et entraîne le prochain frais. Tu peux encore choisir un regard de dix minutes plus tard.",
      },
    ],
  },
  {
    id: 's07',
    mood: 'family',
    topic: 'family',
    ease: 2,
    situation:
      "L'évier est encore plein et c'était le tour de quelqu'un d'autre. Tu l'as déjà fait deux fois cette semaine. Une chaleur connue monte pendant que tu les entends chantonner dans l'autre pièce, pas méchants, juste ailleurs.",
    reframe: 'Quelle demande, en une phrase ordinaire, rendrait la semaine plus simple ?',
    options: [
      {
        style: 'reactive',
        label: 'Fais la vaisselle très fort, puis énumère chaque tâche que tu as faite depuis lundi.',
        cue: 'marque les points',
        reflection:
          "La liste veut être vue. Compter les points arrive souvent en vague. Tu peux vouloir de l'équité sans faire de l'évier un tribunal.",
      },
      {
        style: 'boundary',
        label: "Laisse l'évier, et dis que tu ne feras pas une troisième tournée tant que vous n'aurez pas un nouveau partage aujourd'hui.",
        cue: 'stoppe le tour en trop',
        reflection:
          "Une éponge posée peut être une phrase. Tu as nommé une limite sans inventer un vilain. La personne qui chantonne pourra rejoindre le plan une fois qu'elle l'entendra.",
      },
      {
        style: 'constructive',
        label: "Demande s'ils peuvent prendre l'évier après leur chanson, et colle une rotation simple sur le frigo.",
        cue: 'fais un petit plan',
        reflection:
          "Une rotation, c'est ennuyeux de la meilleure façon. Tu as transformé la chaleur en outil que la maison peut voir. Le chant et l'équité peuvent partager une cuisine.",
      },
    ],
  },
  {
    id: 's08',
    mood: 'frustration',
    topic: 'work',
    ease: 2,
    situation:
      "Le message d'un collègue fait deux lignes, sèches : le fichier est en retard, encore. Pas de bonjour. Tu attendais quelqu'un d'autre, et tu avais un brouillon. Le ton arrive comme une porte sur les doigts.",
    reframe: "Quel est le seul fait que tu voudrais qu'ils aient, et quelle est sa version la plus courte ?",
    options: [
      {
        style: 'reactive',
        label: 'Réponds sur le même ton et mets quelqu\'un de plus haut en copie pour qu\'ils le sentent.',
        cue: 'rends la chaleur',
        reflection:
          "Rendre la chaleur, c'est une justice rapide et un bazar lent. Le fichier en retard reste le travail. Tu peux être net sans ouvrir un second front.",
      },
      {
        style: 'boundary',
        label: "Réponds sur le fichier, et ajoute que tu as besoin d'un bonjour et d'une vraie date, pas d'une pique.",
        cue: 'nomme le ton',
        reflection:
          "Tu as fait le travail et nommé la manière. C'est une limite au bureau. Les gens peuvent s'ajuster ; tu n'as pas eu à faire semblant que la pique allait.",
      },
      {
        style: 'avoidant',
        label: "Laisse le message non lu pour ne pas avoir à le sentir aujourd'hui.",
        cue: 'reporte la pique',
        reflection:
          "Non lu, c'est un abri. Le fichier est toujours là. Un toi plus tard retrouvera les deux mêmes lignes ; un mini-plan maintenant peut rendre cette rencontre plus petite.",
      },
      {
        style: 'constructive',
        label: 'Envoie le brouillon en nommant le morceau manquant, et une heure où tu peux finir le reste.',
        cue: 'réponds au travail',
        reflection:
          "Tu as répondu à la vraie demande. Le ton peut attendre. Une heure nommée est une porte ; elle vous permet de reposer la chaleur tous les deux.",
      },
    ],
  },
  {
    id: 's09',
    mood: 'disappointment',
    topic: 'social',
    ease: 2,
    situation:
      "Des photos d'un déjeuner apparaissent dans l'album partagé. Tu n'étais pas invité, alors que tu travailles avec presque tout le monde sur l'image. Personne ne t'a identifié. L'après-midi devient bizarrement bruyant dans une pièce calme.",
    reframe: 'Quelle histoire racontes-tu sur la chaise vide, et est-ce la seule ?',
    options: [
      {
        style: 'reactive',
        label: "Poste une blague piquante sous l'album pour qu'ils sachent que tu as vu.",
        cue: 'fais-les grimacer',
        reflection:
          "La blague porterait la pique dans leur journée. Ça pourrait même marcher. Ça te collerait aussi à la blessure. Tu peux vouloir être inclus sans transformer l'album en piège.",
      },
      {
        style: 'curious',
        label: "Demande à une personne, simplement, si c'était une table de dernière minute et s'il y a de la place la prochaine fois.",
        cue: "vérifie l'histoire",
        reflection:
          "Une question plate bat un roman sur ta valeur. Parfois la table était minuscule. Parfois c'était un oubli. Dans les deux cas tu obtiens un fait au lieu d'un brouillard.",
      },
      {
        style: 'constructive',
        label: 'Propose un café avec deux d\'entre eux cette semaine, un jour où tu peux vraiment venir.',
        cue: 'fabrique une place',
        reflection:
          "Tu as construit une place au lieu de fixer la photo. Tous les déjeuners ne t'incluront pas. Tu peux quand même t'exercer à demander la prochaine petite table.",
      },
    ],
  },
  {
    id: 's10',
    mood: 'delay',
    topic: 'procrastination',
    ease: 2,
    situation:
      "La boîte mail est un tas que tu n'as pas ouvert depuis lundi. Tu sais que deux messages demandent une réponse. Chaque déverrouillage du téléphone devient une visite des autres applis. Le badge non lu est devenu une petite météo.",
    reframe: 'Quel unique message, une fois répondu, rendrait le tas moins semblable à de la météo ?',
    options: [
      {
        style: 'avoidant',
        label: "Éteins le badge et te promets un vrai jour mail dimanche.",
        cue: 'reporte le tas',
        reflection:
          "Dimanche est une histoire gentille. Les tas poussent dans le noir. Un badge éteint peut être un repos si une vraie réponse a encore lieu aujourd'hui. Sinon la météo reste.",
      },
      {
        style: 'reactive',
        label: 'Ouvre tout d\'un coup et envoie des réponses courtes et agacées pour faire tomber le chiffre.',
        cue: 'passe en force',
        reflection:
          "La vitesse peut être une panique. Faire tomber un chiffre n'est pas la même chose que répondre à des gens. Tu peux encore choisir une note et lui donner une phrase humaine.",
      },
      {
        style: 'constructive',
        label: 'Choisis les deux notes qui comptent, réponds en dix minutes, et laisse le reste fermé.',
        cue: 'deux, puis stop',
        reflection:
          "Deux notes, c'est une porte. S'arrêter fait partie du geste. Le badge peut attendre ; les personnes derrière les deux notes ne sentent pas tout le tas.",
      },
      {
        style: 'curious',
        label: "Avant d'ouvrir quoi que ce soit, écris ce que tu t'attends à trouver, puis ouvre un message et compare.",
        cue: "teste l'appréhension",
        reflection:
          "L'appréhension écrit de la fiction. Un vrai message, c'est de la donnée. La curiosité te fait entrer sans promettre de finir la montagne avant midi.",
      },
    ],
  },
  {
    id: 's11',
    mood: 'mistake',
    topic: 'failure',
    ease: 3,
    situation:
      "Tu fais tomber une assiette dans un petit café. Elle ne casse pas très fort, mais elle casse. Quelques têtes se tournent. Le personnel arrive déjà avec une balayette. Tu as les oreilles en feu et tu voudrais un trapèze poli dans le plancher.",
    reframe: "Dans deux jours, quelle place cette assiette aura-t-elle dans la semaine de quelqu'un d'autre ?",
    options: [
      {
        style: 'reactive',
        label: "Multiplie les excuses, propose de payer plus que l'assiette, et ris trop fort de toi-même.",
        cue: 'fais un numéro',
        reflection:
          "Le numéro essaie d'acheter de la sécurité. On balaie déjà l'assiette. Tu peux être désolé en une phrase et laisser la salle retrouver son café.",
      },
      {
        style: 'avoidant',
        label: "Laisse un peu d'argent et sors avant que quelqu'un te parle.",
        cue: 'file',
        reflection:
          "Partir évite le rouge et saute aussi la réparation ordinaire. La plupart des salles sont faites pour une assiette par terre. Tu as le droit de rester et d'être une personne qui en a fait tomber une.",
      },
      {
        style: 'constructive',
        label: "Aide à balayer s'ils veulent, paie l'assiette, et commande ce que tu étais venu prendre.",
        cue: 'répare, puis reste',
        reflection:
          "Rester, c'est le courage ennuyeux. Une assiette payée et un thé fini racontent à ton système nerveux que l'histoire est close. Les têtes tournées sont déjà revenues à leurs tasses.",
      },
      {
        style: 'curious',
        label: "Demande au personnel ce qu'ils font d'habitude, et suis ça plutôt que d'inventer une punition.",
        cue: 'demande la règle',
        reflection:
          "Les maisons ont des règles ordinaires pour le désordre. Demander te remet dans le monde adulte. Tu n'as pas à en écrire une plus dure dans ta tête.",
      },
    ],
  },
  {
    id: 's12',
    mood: 'awkward',
    topic: 'social',
    ease: 3,
    situation:
      "Tu te trompes de prénom pour quelqu'un que tu as déjà vu deux fois. La personne te corrige gentiment. Ton esprit se vide, puis s'agite. Le reste de la salutation est encore dans ta bouche, inachevé.",
    reframe: 'Que voudrais-tu si on se trompait de prénom pour toi dans un palier ?',
    options: [
      {
        style: 'avoidant',
        label: "Ris pour passer, saute le reste de la salutation, et évite-les jusqu'à la fin de la soirée.",
        cue: 'quitte le palier',
        reflection:
          "Les éviter protège le rouge et abandonne le bonjour. La plupart des gens retiennent la correction, pas l'erreur. Tu peux encore finir le hello plus tard.",
      },
      {
        style: 'reactive',
        label: "Raconte longuement à quel point tu es nul avec les prénoms, pour qu'ils te rassurent.",
        cue: 'ramène à toi',
        reflection:
          "L'histoire leur demande de soigner ta gêne. Un prénom se répare petit. Tu peux garder leur gentillesse sans les embaucher comme consolateurs.",
      },
      {
        style: 'boundary',
        label: 'Remercie pour la correction, dis le bon prénom une fois, et n\'en fais pas un numéro.',
        cue: 'corrige et continue',
        reflection:
          "Un merci, un bon prénom, on avance. C'est du respect sans défilé. Tu as aussi montré comment tu aimerais être corrigé : brièvement, puis de retour au jour.",
      },
      {
        style: 'constructive',
        label: 'Utilise le bon prénom dans la phrase suivante, et note-le une fois hors du palier.',
        cue: 'ancre-le',
        reflection:
          "S'exercer dans la phrase suivante, c'est comme ça qu'un prénom devient le tien à garder. Un mot dans la poche est une gentillesse pour le toi de plus tard et pour eux.",
      },
    ],
  },
  {
    id: 's13',
    mood: 'money',
    topic: 'money',
    ease: 3,
    situation:
      "L'addition partagée arrive et tu as commandé moins que les autres. Quelqu'un propose de couper en parts égales, c'est plus simple. Tu peux payer le surplus, et tu sens aussi la petite injustice vibrer sous la table.",
    reframe: "Quelle phrase garderait à la fois l'amitié et les chiffres honnêtes ?",
    options: [
      {
        style: 'reactive',
        label: "Fais une blague sur le fait de toujours payer le dessert des autres, jusqu'à ce que la table se taise.",
        cue: 'pique en riant',
        reflection:
          "La blague a dit la vérité de biais et a demandé à la table de la sentir. L'humour ouvre une porte ou la cloue. Tu as encore le droit de vouloir un partage plus juste.",
      },
      {
        style: 'avoidant',
        label: "Paie la part égale, souris, et décide que tu ne viendras pas la prochaine fois.",
        cue: 'souris et saute le prochain',
        reflection:
          "Un sourire peut être une addition payée deux fois : en argent, puis en sortie discrète. Tu peux revenir la prochaine fois et encore demander un partage plus simple dès le départ.",
      },
      {
        style: 'constructive',
        label: "Propose de payer tes plats plus une part du pourboire, et laisse les autres régler le reste.",
        cue: 'nomme un juste partage',
        reflection:
          "Une offre précise est plus facile à rencontrer qu'une humeur. Tu as gardé la soirée et les chiffres dans la même pièce. L'équité n'a pas besoin d'une scène.",
      },
      {
        style: 'boundary',
        label: "Dis que tu partages volontiers pourboire et extra, pas les plats que tu n'as pas commandés.",
        cue: 'trace la ligne gentiment',
        reflection:
          "Tu as dit oui à un partage et non au reste. C'est une limite avec encore un sourire. Les amis peuvent entendre un chiffre clair.",
      },
    ],
  },
  {
    id: 's14',
    mood: 'family',
    topic: 'family',
    ease: 3,
    situation:
      "Deux proches te veulent le même soir : un appel promis la semaine dernière, et une visite qui aiderait pour une course d'école. Tu as dit peut-être aux deux. Ton agenda ressemble à un nœud, et tous les deux attendent.",
    reframe: 'Si tu ne pouvais tenir qu\'une promesse ce soir, laquelle te ressemble encore ?',
    options: [
      {
        style: 'reactive',
        label: "Envoie aux deux un message pressé pour dire que personne ne comprend à quel point tu es pris.",
        cue: 'montre le nœud',
        reflection:
          "Le nœud est vrai. Le montrer comme un reproche libère rarement une main. Tu peux encore choisir un oui et un plus tard, sans bulletin météo sur toute ta vie.",
      },
      {
        style: 'avoidant',
        label: "Ignore les deux fils jusqu'à ce que le soir soit passé, puis excuse-toi en termes généraux.",
        cue: 'laisse l\'horloge décider',
        reflection:
          "L'horloge décidera, et les deux se sentiront lâchés. Un pardon vague plus tard pèse plus qu'un vrai report maintenant. Tu as le droit de choisir.",
      },
      {
        style: 'boundary',
        label: "Tiens la promesse déjà faite, et propose à l'autre personne un créneau précis cette semaine.",
        cue: 'un oui, un plus tard',
        reflection:
          "Une promesse tenue est une forme de repos. L'autre personne reçoit un vrai créneau, pas un brouillard. Tu n'as pas eu à te couper en deux sur une seule soirée.",
      },
      {
        style: 'constructive',
        label: 'Regarde les minutes réelles, choisis le plan qui tient, et envoie aux deux le même petit horaire.',
        cue: 'mets des heures',
        reflection:
          "Les minutes sont plus douces que la culpabilité. Un horaire partagé permet à chacun de s'organiser. Tu as traité ta soirée comme quelque chose qu'on peut dessiner, pas seulement subir.",
      },
    ],
  },
  {
    id: 's15',
    mood: 'frustration',
    topic: 'transport',
    ease: 3,
    situation:
      "Le tram saute ton arrêt sans ouvrir. Tu étais à la porte. Le conducteur montre plus loin comme si c'était évident. Tu vas maintenant monter une côte pour laquelle tu n'es pas habillé, avec un sac devenu plus lourd en dix secondes.",
    reframe: 'Que contrôles-tu encore, entre cette côte et la porte où tu allais ?',
    options: [
      {
        style: 'reactive',
        label: 'Frappe la vitre et crie une note du service aux portes fermées.',
        cue: 'punis le tram',
        reflection:
          "Le tram n'entend pas une critique. Ton corps, si. Un cri dépense une énergie dont la côte pourrait avoir besoin. Le saut était rude ; tu choisis encore les dix prochaines minutes.",
      },
      {
        style: 'constructive',
        label: 'Vérifie le prochain tram, puis commence la côte à un pas que tu peux tenir, et préviens si tu seras en retard.',
        cue: 'marche le plan',
        reflection:
          "Un pas et un message transforment un camouflet en trajet. Tu n'as pas à aimer la côte pour la finir. Le toi de plus tard sera content que tu aies bougé.",
      },
      {
        style: 'curious',
        label: "Demande à quelqu'un sur le quai si ce saut est un changement connu, puis décide avec ce fait.",
        cue: 'cherche le motif',
        reflection:
          "Parfois c'est un hasard ; parfois un nouveau motif. Demander te garde dans le monde adulte des informations. Tu peux encore marcher, attendre, ou écrire un mot calme plus tard.",
      },
      {
        style: 'avoidant',
        label: "Assieds-toi sur le banc et te dis que tu rentreras, même si ça défait l'après-midi.",
          cue: 'rentre plutôt',
        reflection:
          "Un banc est permis. Annuler tout l'après-midi parce qu'une porte est restée close, c'est offrir ta journée au tram. Tu peux souffler une minute et encore choisir la côte.",
      },
    ],
  },
  {
    id: 's16',
    mood: 'delay',
    topic: 'work',
    ease: 3,
    situation:
      "La réunion d'avant a débordé. Les gens parlent encore sur les chaises que tu as réservées. Tes notes sont dans tes mains. Une horloge que tu ne peux pas arrêter mange le temps dont tu avais besoin pour être clair. Personne n'a levé les yeux.",
    reframe: 'Quelle plus petite interruption protégerait la demi-heure suivante pour tout le monde ?',
    options: [
      {
        style: 'avoidant',
        label: "Attends dans le couloir qu'ils finissent, même s'il te reste dix minutes pour ta propre séance.",
        cue: 'cède la salle',
        reflection:
          "La politesse peut effacer un plan. Le couloir est sûr et coûte ce que tu es venu faire. Tu peux encore être courtois et frapper.",
      },
      {
        style: 'reactive',
        label: "Entre en parlant, pose tes papiers, et laisse-les sentir le débordement.",
        cue: 'reprends la salle',
        reflection:
          "Le débordement n'était pas le tien. Reprendre la salle comme une bousculade fait un second bazar. Tu peux entrer et encore laisser aux gens leur dignité.",
      },
      {
        style: 'constructive',
        label: "Frappe, nomme ton heure de début, et offre deux minutes pour conclure, ou une autre salle si tu en connais une.",
        cue: 'propose de conclure',
        reflection:
          "Une heure nommée plus une offre, c'est comme ça que les salles changent de mains. Tu as protégé ta séance sans faire de la réunion d'avant un ennemi.",
      },
      {
        style: 'boundary',
        label: 'Dis que tu commences dans deux minutes dans cette salle, et tiens l\'heure même si quelques-uns rangent encore.',
        cue: 'garde ton créneau',
        reflection:
          "Ton créneau est une chose réelle. Deux minutes, c'est de la courtoisie ; donner le reste est une habitude. Les gens peuvent ranger pendant que tu ouvres une note. C'est permis.",
      },
    ],
  },
  {
    id: 's17',
    mood: 'disappointment',
    topic: 'failure',
    ease: 3,
    situation:
      "Le gâteau que tu as fait pour une petite réunion sort du moule en deux morceaux tristes. Il a encore bon goût. Tu avais imaginé une part nette dans une assiette. Les gens arrivent dans quarante minutes et la cuisine sent le sucre et la défaite.",
    reframe: 'Qu\'est-ce qui ferait encore de ce gâteau un cadeau, même en morceaux ?',
    options: [
      {
        style: 'reactive',
        label: "Jette les morceaux et achète quelque chose de lisse pour que personne ne sache que tu as essayé.",
        cue: 'cache l\'essai',
        reflection:
          "Jeter un bon gâteau pour cacher l'effort est un marché dur. Les gens viennent pour toi. Une boîte lisse est optionnelle ; l'essai est déjà le cadeau.",
      },
      {
        style: 'avoidant',
        label: "Fais comme si tu n'avais jamais voulu pâtisser, et sers seulement les biscuits du fond du placard.",
        cue: 'nie le gâteau',
        reflection:
          "Nier la pâtisserie protège l'image dans ta tête et gaspille le sucre. Tu peux servir des morceaux et rester un hôte. L'histoire peut être douce.",
      },
      {
        style: 'curious',
        label: "Demande à un ami qui se débrouille en cuisine ce qu'il ferait de deux morceaux et de quarante minutes.",
        cue: 'emprunte un cerveau',
        reflection:
          "Emprunter un cerveau n'est pas un échec. Quarante minutes suffisent pour un crumble, un trifle, ou un tas avec de la crème. La curiosité garde la soirée mangeable.",
      },
      {
        style: 'constructive',
        label: 'Transforme les morceaux en bols avec crème et fruit, et raconte ça comme un joyeux bazar.',
        cue: 'sers le bazar',
        reflection:
          "Un bol, c'est une assiette avec de la merci. Tu as gardé le cadeau et lâché le numéro. Les gens retiennent la table plus que le moule.",
      },
    ],
  },
  {
    id: 's18',
    mood: 'awkward',
    topic: 'social',
    ease: 3,
    situation:
      "Tu réalises que tu parles depuis un long moment à table. Deux visages ont l'air poliment fatigués. Tu étais nerveux et l'histoire a poussé des pièces en trop. Il y a une pause qui appartient à quelqu'un d'autre, et tu es encore dedans.",
    reframe: 'À quoi ressemblerait, en une courte phrase, le fait de rendre la pause ?',
    options: [
      {
        style: 'avoidant',
        label: "Coupe au milieu d'une phrase, fixe ton assiette, et parle à peine jusqu'à la fin du repas.",
        cue: 'deviens silencieux',
        reflection:
          "Le silence après un long récit peut ressembler à une pénitence. La table n'a pas besoin que tu disparaisse ; elle a besoin d'un tour. Tu peux revenir en écoute sans t'effacer.",
      },
      {
        style: 'boundary',
        label: "Dis que tu as assez pris l'air, et pose une vraie question à la personne la plus tranquille.",
        cue: 'rends la parole',
        reflection:
          "Nommer l'air et le passer, c'est une limite sociale que tu t'appliques. C'est de l'habileté, pas de la honte. La personne tranquille attendait peut-être.",
      },
      {
        style: 'constructive',
        label: "Pose l'histoire en une ligne, ris des pièces en trop, et invite le récit de quelqu'un d'autre.",
        cue: 'atterris, puis invite',
        reflection:
          "Atterrir est une gentillesse. Les pièces en trop peuvent être une blague partagée, pas un trou. Tu es resté à table, une personne parmi des personnes.",
      },
      {
        style: 'reactive',
        label: "Continue plus vite pour que la pause n'arrive pas, et ajoute un détail qu'on ne t'a pas demandé.",
        cue: 'dépasse le calme',
        reflection:
          "La vitesse est une façon de ne pas sentir la pause. Les visages fatigués sont une information, pas une attaque. Tu peux encore t'arrêter. L'histoire restera.",
      },
    ],
  },
];

export const SCENARIOS: Record<Locale, readonly Scenario[]> = { en: EN, fr: FR };
