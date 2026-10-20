/**
 * English scenes for Decision Dungeon. Original, ordinary, warm. Each scenario
 * lists its options in the order of `SCENARIOS[i].styles` (content.ts). Read by
 * the Screen only.
 */
import type { ScenarioText } from './content';

export const EN: Record<string, ScenarioText> = {
  s01: {
    situation:
      'You reach the stop just as your bus pulls away. The next one is in twenty minutes, and you promised friends you would be there for the start of the film. Your shoulders tighten and you check the time twice.',
    reframe: 'What can you still change in the next twenty minutes?',
    options: [
      {
        style: 'constructive',
        label: 'Tell your friends you will be about twenty minutes late, and take the next bus.',
        cue: 'send an update',
        reflection:
          'Well done. You cannot change the timetable, but you changed what your friends know. A short message and a new arrival time turn a missed bus into a small delay.',
      },
      {
        style: 'reactive',
        label: 'Message the group that public transport is hopeless and they should start without you.',
        cue: 'vent at once',
        reflection:
          'Understandable: missing a bus by seconds is annoying. Venting helps for a minute, but your friends get a mood instead of a plan. A calm, short update would give them something useful.',
      },
      {
        style: 'avoidant',
        label: 'Tell yourself the evening will be spoiled anyway and go home.',
        cue: 'give up and go home',
        reflection:
          'Wanting to drop everything after a small setback is very human. Twenty minutes is not much, though. You could decide to go, and still leave early if it does not feel right.',
      },
    ],
  },
  s02: {
    situation:
      'You send your manager a report, then spot a wrong total on page two. There has been no reply yet. Your face feels warm, and you keep reopening the sent message to look at the mistake again.',
    reframe: 'What would you say to a colleague who found the same wrong total in their own report?',
    options: [
      {
        style: 'reactive',
        label: 'Write a long apology full of self-criticism, and send it before anyone has even replied.',
        cue: 'apologise at length',
        reflection:
          'Rushing to punish yourself first is very natural. A long apology can leave the reader reassuring you instead of reading the report. One short line with the fix is usually plenty.',
      },
      {
        style: 'constructive',
        label: 'Send a short follow-up with the corrected page and one line saying what changed.',
        cue: 'send the correction',
        reflection:
          'A clear correction shows care, and people tend to remember the fix more than the slip. You spotted the mistake yourself, which is the hardest part. What is left is one small message.',
      },
      {
        style: 'avoidant',
        label: 'Say nothing and hope that nobody reads page two closely.',
        cue: 'wait and see',
        reflection:
          'Hoping is a normal way to cope with embarrassment. But if that total matters, a quiet correction today will weigh less than several days of wondering whether anyone noticed.',
      },
    ],
  },
  s03: {
    situation:
      'An appointment you need to book has sat on your list for nearly a week. It would take five minutes on the phone. Each time you pick up your phone, something else feels more urgent, and the task keeps growing in your head.',
    reframe: 'What is the smallest first step you could finish before the kettle boils?',
    options: [
      {
        style: 'avoidant',
        label: 'Move it to next week and tell yourself you will feel readier then.',
        cue: 'push it back',
        reflection:
          'Moving a task is not a failing; sometimes it is the right call. Without a day and a time, though, next week usually looks a lot like this one. Pick a slot, even a small one.',
      },
      {
        style: 'curious',
        label: 'Write down what exactly you are dreading about the call, then read the list back.',
        cue: 'name the dread',
        reflection:
          'Seeing a worry on paper often makes it smaller and more precise. That is a good first step. Once the list is written, the call itself is usually the easier part.',
      },
      {
        style: 'constructive',
        label: 'Set a five-minute timer and make the call.',
        cue: 'five minutes, now',
        reflection:
          'A timer shrinks the job to its real size. You did not need to feel ready, only to begin. The thing that weighed on you all week is now behind you.',
      },
    ],
  },
  s04: {
    situation:
      'A friend cancels the dinner you have both looked forward to, with a short message and no new date. You had kept the evening free and even picked the restaurant. You read the message again, hoping it will sound warmer.',
    reframe: 'If you were the one cancelling, what would you hope your friend understood?',
    options: [
      {
        style: 'boundary',
        label: 'Say you are disappointed, and ask them to suggest a new date when they can.',
        cue: 'say how you feel',
        reflection:
          'You named your feeling and asked for what you need, without blame. That is a boundary in its gentlest form. Your friend can answer it, and you did not have to swallow it in silence.',
      },
      {
        style: 'constructive',
        label: 'Answer kindly that you will wait for a new date, and plan something small for tonight.',
        cue: 'make a plan B',
        reflection:
          'You gave the free evening something of your own. Nothing is lost between you two; you simply looked after yourself while you wait for a new date.',
      },
      {
        style: 'avoidant',
        label: 'Leave the message unanswered and stop suggesting plans for a while.',
        cue: 'go quiet',
        reflection:
          'When we feel hurt, pulling back is understandable. A short silence is fine, but a long one can turn a cancelled dinner into distance. A simple reply keeps the warmth.',
      },
      {
        style: 'reactive',
        label: 'Reply that they always do this and that you are tired of making plans.',
        cue: 'hit back',
        reflection:
          'That stings, and being disappointed is fair. A message sent in the first minutes often says "always" when the truth is "this time". You can keep the feeling and still leave the door open.',
      },
    ],
  },
  s05: {
    situation:
      'Your bank statement shows a charge you do not recognise, about the price of a lunch. It is small enough to feel silly about and big enough to irritate you. You were already counting every euro this week.',
    reframe: 'If this were a friend’s statement, what would be your first calm question?',
    options: [
      {
        style: 'constructive',
        label: 'Note the date and amount, check your records, then ask one clear question.',
        cue: 'check, then ask',
        reflection:
          'Facts first, feelings second: that order often gets a real answer. A date, an amount and one clear question give the other person something they can actually fix.',
      },
      {
        style: 'avoidant',
        label: 'Close the banking app and tell yourself it is not worth the bother.',
        cue: 'look away',
        reflection:
          'Small amounts are easy to wave away, and not wanting to deal with it is human. If it is a mistake, though, it may repeat. Ten minutes later today could save you the same annoyance next month.',
      },
      {
        style: 'reactive',
        label: 'Call the number on the statement and open with a complaint before they can speak.',
        cue: 'start angry',
        reflection:
          'Irritation at an unexpected charge makes sense. Starting heated often means the person helping you ends up defending themselves. The same call goes better when you begin with the date and the amount.',
      },
    ],
  },
  s06: {
    situation:
      'You are the last one home on a busy evening. Nobody has decided what to eat, and everyone answers "I don\'t mind" when you ask. You are hungry, and the kitchen already feels like a small test.',
    reframe: 'What would make it easy for everyone to answer in a few words?',
    options: [
      {
        style: 'reactive',
        label: 'Say sharply that you always have to organise everything in this house.',
        cue: 'snap',
        reflection:
          'Tiredness and hunger make everything sound bigger. "Always" is likely to start an argument about the past instead of dinner. You can mention how much you plan once you have eaten.',
      },
      {
        style: 'constructive',
        label: 'Offer two simple choices and ask everyone to pick one within five minutes.',
        cue: 'give two options',
        reflection:
          'Two options are easier to answer than an open question. You turned "I don\'t mind" into a decision without raising your voice, and you showed how little it takes.',
      },
      {
        style: 'avoidant',
        label: 'Grab a snack and go to your room, leaving the others to sort it out.',
        cue: 'step away',
        reflection:
          'Wanting a break after a long day is fair, and a snack helps. One sentence such as "I am cooking, who wants some?" could spare you an awkward, hungry silence later.',
      },
      {
        style: 'constructive',
        label: 'Start cooking something quick, and say the others are welcome to join in.',
        cue: 'start cooking',
        reflection:
          'You looked after your own hunger and kindly left the door open. Often one person starting is enough to get everyone moving, and nobody had to be told off.',
      },
    ],
  },
  s07: {
    situation:
      'The washing-up is piled up again, and it was meant to be someone else\'s turn. You have already done it twice this week. You can hear them laughing in the next room, quite relaxed, and your jaw tightens.',
    reframe: 'What is one ordinary sentence that would make next week easier?',
    options: [
      {
        style: 'reactive',
        label: 'Slam the pans around and list everything you have done since Monday.',
        cue: 'make a scene',
        reflection:
          'Frustration often arrives with a scoreboard. The list is true, and being seen matters. Loud pans tend to make people defend themselves, though, instead of hearing how tired you are.',
      },
      {
        style: 'constructive',
        label: 'Wash up now, then ask for ten minutes after dinner to draw up a simple rota together.',
        cue: 'fix it, then plan',
        reflection:
          'You sorted the kitchen and still asked for a fairer plan. Because you chose a calm moment, nobody feels ambushed. A rota on the fridge is dull, and it works.',
      },
      {
        style: 'boundary',
        label: 'Leave it, and tell them calmly you will not take another turn until you agree a fair rota.',
        cue: 'set a limit',
        reflection:
          'You set a limit without insulting anyone. Stepping back from the sink and saying why is clear and fair. They now know what you need, and can help decide how to get there.',
      },
    ],
  },
  s08: {
    situation:
      'A colleague writes two curt lines: your part is late, again. There is no greeting. You were waiting on someone else\'s input, and your draft is nearly ready. The tone lands like a slammed door.',
    reframe: 'What is the one fact you want them to have, and how short can it be?',
    options: [
      {
        style: 'constructive',
        label: 'Reply with the draft, say what you are still waiting for, and give a finish time.',
        cue: 'answer the work',
        reflection:
          'You answered the real question: where things stand and when they will be done. A time gives both of you something solid. The tone can be a separate chat if it keeps happening.',
      },
      {
        style: 'reactive',
        label: 'Answer in the same curt tone and copy in a manager so the point is made.',
        cue: 'return fire',
        reflection:
          'Matching a sharp tone feels fair in the moment. Copying a manager, though, can turn a small delay into a bigger dispute. You can keep your point and still keep it between the two of you.',
      },
      {
        style: 'boundary',
        label: 'Send the draft, and say you would appreciate a greeting and a clear deadline next time.',
        cue: 'name the tone',
        reflection:
          'You did the work and told them how you would like to be spoken to. Saying so politely is a limit, not an attack. People often adjust when they hear it plainly.',
      },
      {
        style: 'avoidant',
        label: 'Leave the message unread until you feel calmer, maybe tomorrow.',
        cue: 'avoid it',
        reflection:
          'Needing time to cool down is sensible. But the message will still be there, and the delay may grow. A one-line holding reply now could protect your calm and keep things moving.',
      },
    ],
  },
  s09: {
    situation:
      'You share a funny story in the group chat and nobody reacts. Three people were typing, then stopped. A minute later someone posts a photo of their lunch. You feel yourself shrinking, and wonder whether to delete your message.',
    reframe: 'What are two other reasons a chat can go quiet, apart from your story?',
    options: [
      {
        style: 'reactive',
        label: 'Post a sarcastic remark so everyone knows you noticed the silence.',
        cue: 'poke back',
        reflection:
          'It hurt, and wanting a reaction is understandable. Sarcasm tends to make a group more careful, not warmer. You can feel the sting without handing it to the whole chat.',
      },
      {
        style: 'constructive',
        label: 'Like the lunch photo, and send your story to a friend who will enjoy it.',
        cue: 'find a better audience',
        reflection:
          'You joined in without chasing a laugh, and you found someone who will enjoy the story. Not every group suits every story, and that says little about the story and nothing about you.',
      },
      {
        style: 'curious',
        label: 'Wonder whether people are simply busy, and see what happens next.',
        cue: 'stay curious',
        reflection:
          'Looking for other explanations is a good habit: chats go quiet for dull reasons all the time. Waiting is fine. If it still nags later, one friendly question to a single person can settle it.',
      },
      {
        style: 'avoidant',
        label: 'Mute the chat for a month and decide never to share anything there again.',
        cue: 'go silent',
        reflection:
          'Taking a break from a chat that stung is sensible. Making it a permanent rule, though, turns one quiet minute into a closed door. A short mute leaves room to come back when it feels lighter.',
      },
    ],
  },
  s10: {
    situation:
      'Your inbox has not been opened since Monday. You know two messages need an answer. Every time you unlock your phone, the unread count seems to have grown, and checking the weather or the news feels so much easier.',
    reframe: 'Which single message, once answered, would make the pile feel lighter?',
    options: [
      {
        style: 'curious',
        label: 'Before opening anything, guess what you will find, then open one message and compare.',
        cue: 'test your guess',
        reflection:
          'Dread tends to imagine worse than reality. Comparing one message with your guess is a gentle way in, and the next one feels less daunting. You can carry on if you like.',
      },
      {
        style: 'avoidant',
        label: 'Turn off the notifications and promise yourself a proper inbox day on Sunday.',
        cue: 'postpone it',
        reflection:
          'Switching off notifications can bring real relief. Sunday is a kind promise, but piles tend to grow. If you also answer one message today, the promise becomes much easier to keep.',
      },
      {
        style: 'constructive',
        label: 'Pick the two important messages, answer them in ten minutes, and close the inbox.',
        cue: 'two, then stop',
        reflection:
          'Two answers is a real step, and stopping on purpose is part of the skill. The other messages can wait, and the two people you answered will be glad to hear from you.',
      },
      {
        style: 'reactive',
        label: 'Open everything at once and fire off short, irritated answers to clear the number.',
        cue: 'rush through',
        reflection:
          'Wanting the number to go down is natural. Fast, sharp replies often create new questions to answer. You do not have to clear everything, only the messages that matter.',
      },
    ],
  },
  s11: {
    situation:
      'Photos of a team lunch appear online. You were not invited, though you work with most of the people in them. Nobody has mentioned it. The afternoon feels louder than usual, and your desk seems far from everyone.',
    reframe: 'What else could explain a lunch you were not part of, and is there a way to check?',
    options: [
      {
        style: 'constructive',
        label: 'Suggest a coffee to two colleagues this week, on a day you can really make it.',
        cue: 'make a plan',
        reflection:
          'Instead of staring at the photos, you made a place for yourself at a future table. You cannot be at every lunch, but you can always ask for the next one.',
      },
      {
        style: 'reactive',
        label: 'Comment under the photos with a joke about being forgotten, so they know you saw.',
        cue: 'make them squirm',
        reflection:
          'Feeling left out is painful, and the joke is trying to say so. It would probably make people uncomfortable rather than closer. You can want to be included without turning the photos into a trap.',
      },
      {
        style: 'curious',
        label: 'Ask yourself whether there could be another reason, like a last-minute booking, before you conclude anything.',
        cue: 'look for other reasons',
        reflection:
          'Looking for other explanations stops your mind writing a darker story. Lunches like this are often put together quickly. It is a good start, and a friendly question can turn a guess into a fact.',
      },
    ],
  },
  s12: {
    situation:
      'The bill arrives after a group dinner. You had a salad and water; the others had starters and desserts. Someone suggests splitting it evenly because it is simpler. You can afford it, but the unfairness nags at you.',
    reframe: 'What sentence would keep both the friendship and the numbers honest?',
    options: [
      {
        style: 'reactive',
        label: 'Joke loudly that you always pay for other people\'s desserts, until the table goes quiet.',
        cue: 'make a pointed joke',
        reflection:
          'The joke told the truth sideways. Humour can open a door or close it, though, and a sharp one often leaves everyone uneasy. You can still ask for a fairer split.',
      },
      {
        style: 'avoidant',
        label: 'Pay the even share, smile, and decide not to come to the next dinner.',
        cue: 'say nothing',
        reflection:
          'Paying quietly can feel easier than a debate. If it keeps bothering you, the cost is bigger than the money. You can come next time and ask for separate bills at the start.',
      },
      {
        style: 'constructive',
        label: 'Suggest everyone pays for their own items in a payment app: it takes two minutes and is fair.',
        cue: 'propose a fair split',
        reflection:
          'You offered a practical way that suits everyone, not only you. Because it is simple and neutral, nobody has to feel accused. Being fair does not have to be awkward.',
      },
      {
        style: 'boundary',
        label: 'Say you are happy to share the tip, but you would like to pay only for what you ordered.',
        cue: 'say what you will pay',
        reflection:
          'You said yes to some sharing and no to the rest, in plain words. Friends can handle a clear number, and the table now has a fair option to agree to.',
      },
    ],
  },
  s13: {
    situation:
      'You knock a glass off a café table and it shatters. A few people turn to look. A member of staff is already fetching a brush. Your cheeks burn, and for a moment you would like to vanish through the floor.',
    reframe: 'In two days, how much room will this glass take up in anyone else\'s week?',
    options: [
      {
        style: 'constructive',
        label: 'Say sorry once, offer to help, and pay for the glass.',
        cue: 'own it simply',
        reflection:
          'One honest apology and an offer to help is what most people hope for. The heads that turned have mostly turned back already. You stayed, and that makes it a small thing.',
      },
      {
        style: 'avoidant',
        label: 'Leave some cash on the table and slip out before anyone talks to you.',
        cue: 'slip away',
        reflection:
          'Wanting to vanish is a very common reaction, and paying is thoughtful. Leaving without a word skips the part that is often easiest: a quick sorry and a thank you, and then it is over.',
      },
      {
        style: 'reactive',
        label: 'Keep apologising, laughing loudly at your own clumsiness.',
        cue: 'make light of it',
        reflection:
          'Joking can be how we cope with embarrassment. A long show asks the room to reassure you, though. One clear sorry is enough, and the staff can get back to their day.',
      },
      {
        style: 'constructive',
        label: 'Ask what you can do to help, then stay and finish your coffee.',
        cue: 'stay and help',
        reflection:
          'Staying to finish your coffee shows yourself that the moment has passed. Cafés are used to breakages. You were polite, helpful and a customer all at once.',
      },
    ],
  },
  s14: {
    situation:
      'Two relatives ask for the same Saturday afternoon: one needs help moving a cupboard, the other wants a long-promised visit. You said "maybe" to both. They are each waiting for an answer, and your calendar feels like a knot.',
    reframe: 'If you could keep only one promise today, which one would still feel like you?',
    options: [
      {
        style: 'boundary',
        label: 'Say yes to one for Saturday, and offer the other a specific day next week.',
        cue: 'one yes, one later',
        reflection:
          'You gave a clear yes to one and a clear "not Saturday" to the other, with an alternative. That respects both people and your own limits. Nobody can be in two places at once.',
      },
      {
        style: 'constructive',
        label: 'Check how long each thing really takes, then tell both the same plan.',
        cue: 'plan the hours',
        reflection:
          'Looking at real minutes is gentler than looking at guilt. If both can fit, you have found a solution; if not, you can say so early. Either way, both people hear the same simple plan.',
      },
      {
        style: 'reactive',
        label: 'Message both that nobody understands how busy you are and you cannot please everyone.',
        cue: 'show your stress',
        reflection:
          'Being pulled in two directions is tiring, and wanting people to see that is natural. Sending it as a complaint, though, can leave both feeling like a burden. You can be honest without the heat.',
      },
      {
        style: 'avoidant',
        label: 'Leave both messages unanswered until Saturday has passed, then apologise.',
        cue: 'let it pass',
        reflection:
          'Waiting can seem to make the problem vanish. Both relatives will probably feel dropped, though, and an apology afterwards weighs more than an honest answer today. You are allowed to choose.',
      },
    ],
  },
  s15: {
    situation:
      'Your train is cancelled and you will miss your connection to a family lunch. The board changes from "delayed" to "cancelled" within a minute. Around you, people sigh and check their phones, and your patience is running thin.',
    reframe: 'What is still within your control between here and the lunch?',
    options: [
      {
        style: 'curious',
        label: 'Ask a member of staff how long disruptions on this line usually last.',
        cue: 'ask for information',
        reflection:
          'Asking gives you facts instead of guesses, which is a good instinct. The next move is yours: with their answer you can choose between waiting and re-routing, instead of just worrying.',
      },
      {
        style: 'reactive',
        label: 'Complain loudly to the nearest member of staff about how the company is run.',
        cue: 'let off steam',
        reflection:
          'A cancelled train is frustrating, and staff hear this all day. Raising your voice rarely speeds anything up. A calm question often gets you the information you need more quickly.',
      },
      {
        style: 'avoidant',
        label: 'Decide the lunch is a lost cause and go home without telling anyone.',
        cue: 'give up',
        reflection:
          'Disappointment can make a plan feel pointless. A cancelled train is a real obstacle, but a short message would let your family know. Even one line spares them from guessing where you are.',
      },
      {
        style: 'constructive',
        label: 'Check other routes, tell your family your new arrival time, and take the best option.',
        cue: 'plan a new route',
        reflection:
          'A new route and a message ahead turn a cancellation into a delay. You cannot fix the train, but you sorted what was yours to sort. Your family can plan around a time.',
      },
    ],
  },
  s16: {
    situation:
      'The meeting before yours is overrunning, and people are still talking in the room you booked. Your notes are in your hand and your own session should already have started. Nobody has looked up, and the minutes are slipping away.',
    reframe: 'What is the smallest interruption that would protect the next half hour for everyone?',
    options: [
      {
        style: 'reactive',
        label: 'Walk in, drop your folder on the table and sigh loudly so they get the message.',
        cue: 'show impatience',
        reflection:
          'The overrun is annoying, and it was not your doing. A loud sigh turns a scheduling slip into a social one, though. You can walk in with the same firmness and a calmer face.',
      },
      {
        style: 'constructive',
        label: 'Knock politely, say when you need the room, and suggest another free room if you know one.',
        cue: 'offer a solution',
        reflection:
          'Offering a solution lets people move on without feeling thrown out. You protected your session and stayed friendly with the earlier group, which makes the next time easier too.',
      },
      {
        style: 'avoidant',
        label: 'Wait in the corridor until they finish, even if that leaves you only ten minutes for your own session.',
        cue: 'wait politely',
        reflection:
          'Politeness is a good quality, and waiting feels safe. If it eats most of your session, though, you lose what you came for. You can stay courteous and still knock.',
      },
      {
        style: 'boundary',
        label: 'Knock, say your session starts now, and ask them to wrap up within two minutes.',
        cue: 'claim your slot',
        reflection:
          'Your time slot is real. Two minutes is a polite window, and saying so clearly respects both groups. People can pack up while you set up, and most will not mind.',
      },
    ],
  },
  s17: {
    situation:
      'You baked a cake for a small get-together, and it comes out of the tin in two pieces. It smells wonderful. You had pictured a neat slice on a plate. Guests arrive in forty minutes and your good mood has gone flat.',
    reframe: 'What would still make this cake a gift, even in two pieces?',
    options: [
      {
        style: 'constructive',
        label: 'Spoon the pieces into bowls with cream and fruit, and call it a pudding.',
        cue: 'serve it differently',
        reflection:
          'A new way of serving it saves the cake and the evening. Guests remember the welcome more than the shape. You kept the gift and let go of the perfect picture.',
      },
      {
        style: 'curious',
        label: 'Ask a friend who cooks well what they would do with two pieces and forty minutes.',
        cue: 'ask for ideas',
        reflection:
          'Borrowing an idea is clever, not a failure: cooks do it all the time. Forty minutes leaves plenty of choice, and you will be ready to pick one as soon as your friend replies.',
      },
      {
        style: 'avoidant',
        label: 'Tell yourself you never planned to serve it and offer only biscuits.',
        cue: 'pretend it never happened',
        reflection:
          'Hiding the cake protects the picture you had in mind. It also hides something you made for them. You can serve it as it is and still be a wonderful host.',
      },
      {
        style: 'reactive',
        label: 'Throw the cake away and buy a perfect one so nobody knows you tried.',
        cue: 'hide the attempt',
        reflection:
          'Disappointment after hours of effort hurts. Binning something that probably tastes good hides the effort your guests would appreciate. A shop cake is fine, but the one you made already counts.',
      },
    ],
  },
  s18: {
    situation:
      'A neighbour asks you to take in their parcels again and to feed their cat next weekend. You have already helped twice this month, and you wanted a quiet weekend. They look hopeful, and you hear yourself starting to say yes.',
    reframe: 'What could you comfortably offer, and what do you need to keep for yourself?',
    options: [
      {
        style: 'avoidant',
        label: 'Say "maybe, let me check" and then avoid them in the hallway for a few days.',
        cue: 'dodge the question',
        reflection:
          'Buying time feels kind in the moment. Dodging them tends to make your next meeting more awkward, for both of you. A clear answer, even a small no, is easier to hear than silence.',
      },
      {
        style: 'reactive',
        label: 'Sigh and say that people always take advantage of how nice you are.',
        cue: 'snap at them',
        reflection:
          'Resentment builds when we say yes too often, and you noticed it. Saying it as an accusation will probably hurt a neighbour who meant no harm. A plain "not this time" keeps things friendly.',
      },
      {
        style: 'constructive',
        label: 'Say you can take the parcels, and suggest a pet-sitting service or another neighbour for the cat.',
        cue: 'offer another way',
        reflection:
          'You stayed helpful without overextending, and you gave them real ideas. Helping someone find a solution is a kind of help too. Neither of you has to feel stuck.',
      },
      {
        style: 'boundary',
        label: 'Say you are happy to take the parcels, but that you cannot look after the cat this time.',
        cue: 'say yes to one part',
        reflection:
          'You offered what you could and declined the rest, kindly. A clear no to one part makes your yes to the other more honest. Good neighbours usually respect that.',
      },
    ],
  },
};
