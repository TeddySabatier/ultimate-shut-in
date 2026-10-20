/**
 * Scènes françaises de Donjon des choix. Écrites pour le français (tutoiement,
 * sans formes genrées), pas traduites phrase à phrase : même structure que
 * l'anglais (mêmes ids, mêmes styles dans le même ordre), pas les mêmes mots.
 * Lues par l'écran seulement.
 */
import type { OptionText, ScenarioText } from './content';

/** Typographie française : espace insécable avant ? ! : ; et à l'intérieur des guillemets. */
function nb(text: string): string {
  return text.replace(/ ([?!:;»])/g, ' $1').replace(/« /g, '« ');
}

function fr(text: ScenarioText): ScenarioText {
  return {
    situation: nb(text.situation),
    reframe: nb(text.reframe),
    options: text.options.map((o): OptionText => ({ style: o.style, label: nb(o.label), cue: nb(o.cue), reflection: nb(o.reflection) })),
  };
}

const RAW: Record<string, ScenarioText> = {
  s01: {
    situation:
      "Tu arrives à l'arrêt juste à temps pour voir ton bus s'éloigner. Le suivant passe dans vingt minutes, et tu avais promis d'être là pour l'apéro chez des amis. Tes épaules se crispent et tu regardes l'heure deux fois.",
    reframe: "Qu'est-ce que tu peux encore changer dans ces vingt minutes ?",
    options: [
      {
        style: 'constructive',
        label: 'Préviens tes amis que tu auras vingt minutes de retard, et prends le bus suivant.',
        cue: 'envoie un message',
        reflection:
          "Bien joué : tu ne peux pas changer l'horaire du bus, mais tu as changé ce que savent tes amis. Un message court et une nouvelle heure transforment un bus raté en petit retard.",
      },
      {
        style: 'reactive',
        label: "Écris au groupe que les transports sont une catastrophe et qu'ils n'ont qu'à commencer sans toi.",
        cue: 'râle tout de suite',
        reflection:
          "Compréhensible : rater un bus de peu, ça agace. Râler soulage une minute, mais tes amis reçoivent une humeur plutôt qu'une information. Un petit message calme leur serait bien plus utile.",
      },
      {
        style: 'avoidant',
        label: 'Dis-toi que la soirée sera ratée de toute façon et rentre chez toi.',
        cue: 'renonce et rentre',
        reflection:
          "Avoir envie de tout lâcher après un petit contretemps, c'est très humain. Vingt minutes de retard, pourtant, ce n'est pas grand-chose. Tu peux décider d'y aller, quitte à repartir plus tôt si ça ne te convient pas.",
      },
    ],
  },
  s02: {
    situation:
      "Tu envoies un compte rendu à ta responsable, puis tu repères un total faux en page deux. Elle n'a pas encore répondu. Tes joues chauffent et tu rouvres le message envoyé pour regarder l'erreur une fois de plus.",
    reframe: 'Que dirais-tu à un collègue qui aurait trouvé le même total faux dans son propre rapport ?',
    options: [
      {
        style: 'reactive',
        label: "Écris un long mail d'excuses où tu te critiques, avant même qu'on t'ait répondu.",
        cue: 'excuse-toi longuement',
        reflection:
          "On a vite fait de se punir soi-même en premier. De longues excuses obligent l'autre à te rassurer au lieu de lire le compte rendu. Une ligne avec la correction suffit presque toujours.",
      },
      {
        style: 'constructive',
        label: 'Envoie un court message avec la page corrigée et une ligne pour dire ce qui a changé.',
        cue: 'envoie la correction',
        reflection:
          "Une correction claire montre du soin, et on retient souvent plus le rectificatif que l'erreur. Tu as repéré la faute toi-même, et c'est le plus difficile. Il ne reste qu'un petit message.",
      },
      {
        style: 'avoidant',
        label: "Ne dis rien et espère que personne ne regardera la page deux de près.",
        cue: 'attends sans rien dire',
        reflection:
          "Espérer, c'est une façon normale de gérer la gêne. Mais si ce total compte, une correction discrète aujourd'hui pèsera moins lourd que plusieurs jours à guetter une réaction.",
      },
    ],
  },
  s03: {
    situation:
      "Un rendez-vous à prendre traîne sur ta liste depuis presque une semaine. Cinq minutes au téléphone suffiraient. Chaque fois que tu attrapes ton portable, autre chose paraît plus urgent, et la tâche grossit dans ta tête.",
    reframe: "Quelle serait la plus petite première étape, celle que tu finirais avant que l'eau du thé soit chaude ?",
    options: [
      {
        style: 'avoidant',
        label: "Remets ça à la semaine prochaine en te disant que tu seras plus d'attaque.",
        cue: 'repousse',
        reflection:
          "Reporter n'est pas une faute, c'est parfois le bon choix. Mais sans jour ni heure, la semaine prochaine ressemblera beaucoup à celle-ci. Fixe-toi un créneau, même petit.",
      },
      {
        style: 'curious',
        label: 'Note ce que tu redoutes au juste dans cet appel, puis relis ta liste.',
        cue: 'nomme la crainte',
        reflection:
          "Voir une inquiétude sur le papier la rend souvent plus petite et plus précise. C'est un bon premier pas. Une fois la liste écrite, l'appel lui-même est généralement la partie facile.",
      },
      {
        style: 'constructive',
        label: 'Lance un minuteur de cinq minutes et passe cet appel.',
        cue: 'cinq minutes, maintenant',
        reflection:
          "Le minuteur ramène la tâche à sa vraie taille. Tu n'avais pas besoin de te sentir d'attaque, juste de commencer. Ce qui pesait depuis une semaine est désormais derrière toi.",
      },
    ],
  },
  s04: {
    situation:
      "Un ami annule le dîner dont vous parliez depuis des semaines, par un message court et sans nouvelle date. Tu avais libéré ta soirée et même choisi le restaurant. Tu relis son message en espérant qu'il sonne plus chaleureux.",
    reframe: "Si c'était toi qui annulais, qu'est-ce que tu aimerais que ton ami comprenne ?",
    options: [
      {
        style: 'boundary',
        label: "Dis-lui que cette annulation te fait de la peine, et demande-lui de proposer une autre date dès qu'il le pourra.",
        cue: 'dis ce que tu ressens',
        reflection:
          "Tu as dit ce que tu ressens et ce que tu attends, sans reproche. C'est une limite sous sa forme la plus douce. Ton ami peut y répondre, et tu n'as pas eu à tout avaler en silence.",
      },
      {
        style: 'constructive',
        label: "Réponds gentiment que tu attends une autre date, et prévois un petit plaisir pour ce soir.",
        cue: 'prévois un plan B',
        reflection:
          "Tu as rempli ta soirée libre avec quelque chose qui te fait du bien. Rien n'est perdu entre vous : tu as simplement pris soin de toi en attendant la nouvelle date.",
      },
      {
        style: 'avoidant',
        label: 'Ne réponds pas et arrête de proposer des sorties pendant un moment.',
        cue: 'fais silence',
        reflection:
          "Quand on est blessé, on a envie de se replier, et c'est compréhensible. Un court silence passe ; un long peut transformer un dîner annulé en distance. Une réponse simple garde la chaleur du lien.",
      },
      {
        style: 'reactive',
        label: "Réponds que c'est toujours pareil et que tu en as assez de faire des plans.",
        cue: 'rends le coup',
        reflection:
          "Ça pique, et être déçu est légitime. Un message envoyé dans la première minute dit souvent « toujours » quand la vérité est « cette fois ». Tu peux garder ta déception et laisser la porte entrouverte.",
      },
    ],
  },
  s05: {
    situation:
      "Sur ton relevé de compte apparaît un prélèvement que tu ne reconnais pas, à peu près le prix d'un déjeuner. C'est assez petit pour que tu te sentes bête d'y penser, et assez gros pour t'agacer. Tu comptais déjà chaque euro cette semaine.",
    reframe: "Si c'était le relevé d'un ami, quelle serait ta première question, posée calmement ?",
    options: [
      {
        style: 'constructive',
        label: "Note la date et le montant, vérifie tes propres justificatifs, puis pose une seule question claire à l'organisme.",
        cue: 'vérifie, puis demande',
        reflection:
          "Les faits d'abord, l'agacement ensuite : c'est souvent cet ordre qui obtient une vraie réponse. Une date, un montant et une question nette donnent à ton interlocuteur de quoi corriger.",
      },
      {
        style: 'avoidant',
        label: "Ferme l'appli de ta banque et dis-toi que ça ne vaut pas la peine.",
        cue: 'regarde ailleurs',
        reflection:
          "Un petit montant se balaie facilement, et ne pas avoir envie de s'en occuper est humain. Mais si c'est une erreur, elle peut se répéter. Dix minutes plus tard dans la journée pourraient t'éviter le même agacement le mois prochain.",
      },
      {
        style: 'reactive',
        label: "Appelle le numéro du relevé et commence par une réclamation, avant même qu'on te réponde.",
        cue: "attaque d'emblée",
        reflection:
          "S'agacer d'un prélèvement inattendu, c'est normal. Mais si tu démarres sur un ton vif, la personne au bout du fil se met à se défendre. Le même appel passe mieux quand tu commences par la date et le montant.",
      },
    ],
  },
  s06: {
    situation:
      "C'est mardi soir et tu rentres le dernier. Personne n'a décidé quoi manger, et chacun répond « ça m'est égal » quand tu demandes. Tu as faim, et la cuisine ressemble déjà à un petit examen.",
    reframe: 'Comment rendre la réponse facile, en quelques mots, pour tout le monde ?',
    options: [
      {
        style: 'reactive',
        label: 'Lance sèchement que tu dois toujours tout organiser dans cette maison.',
        cue: 'claque la phrase',
        reflection:
          "La fatigue et la faim font tout paraître plus gros. Avec « toujours », on lance une dispute sur le passé plutôt qu'un dîner. Tu pourras dire plus tard tout ce que tu organises, une fois à table.",
      },
      {
        style: 'constructive',
        label: "Propose deux idées simples et demande à chacun d'en choisir une d'ici cinq minutes.",
        cue: 'donne deux choix',
        reflection:
          "Deux options, c'est plus facile à trancher qu'une question ouverte. Tu as transformé un « ça m'est égal » en décision sans élever la voix, et tu as montré qu'il suffit de peu.",
      },
      {
        style: 'avoidant',
        label: 'Prends un en-cas et va dans ta chambre, les autres se débrouilleront.',
        cue: "mets-toi à l'écart",
        reflection:
          "Avoir envie de souffler après une longue journée, c'est légitime, et un en-cas aide. Une seule phrase comme « Je cuisine, qui en veut ? » pourrait t'éviter un silence gênant et affamé plus tard.",
      },
      {
        style: 'constructive',
        label: 'Prépare quelque chose de rapide pour toi, et dis que les autres peuvent se joindre.',
        cue: 'lance-toi aux fourneaux',
        reflection:
          "Tu as pris soin de ta faim et laissé la porte ouverte avec gentillesse. Souvent, il suffit qu'une personne commence pour que tout le monde suive. Personne n'a eu à se faire gronder.",
      },
    ],
  },
  s07: {
    situation:
      "La vaisselle s'empile encore, et ce n'était pas ton tour. Tu l'as déjà faite deux fois cette semaine. Tu entends les autres rire dans la pièce d'à côté, bien détendus, et ta mâchoire se serre.",
    reframe: 'Quelle phrase ordinaire rendrait la semaine prochaine plus facile ?',
    options: [
      {
        style: 'reactive',
        label: 'Claque les casseroles et énumère tout ce que tu as fait depuis lundi.',
        cue: 'fais une scène',
        reflection:
          "La frustration arrive souvent avec un tableau de scores. La liste est vraie, et être vu compte. Mais des casseroles qui claquent poussent les gens à se défendre au lieu d'entendre ta fatigue.",
      },
      {
        style: 'constructive',
        label: 'Lave tout maintenant, puis demande dix minutes après le dîner pour établir ensemble un roulement.',
        cue: 'règle puis organise',
        reflection:
          "Tu as remis la cuisine en ordre et demandé un partage plus juste. Comme tu as choisi un moment calme, personne ne se sent pris à partie. Un tableau sur le frigo, c'est banal, et ça marche.",
      },
      {
        style: 'boundary',
        label: "Laisse-la et dis calmement que tu ne referas pas un tour tant qu'on n'aura pas décidé d'un roulement équitable.",
        cue: 'pose une limite',
        reflection:
          "Tu as posé une limite sans insulter personne. Lâcher l'évier en disant pourquoi, c'est clair et juste. Les autres savent ce dont tu as besoin, et peuvent décider avec toi comment y arriver.",
      },
    ],
  },
  s08: {
    situation:
      "Un collègue t'écrit deux lignes sèches : ta partie est en retard, encore. Pas de bonjour. Tu attendais le retour de quelqu'un d'autre, et ton brouillon est presque prêt. Le ton claque comme une porte.",
    reframe: "Quelle est la seule information que tu veux qu'il ait, et jusqu'où peux-tu la raccourcir ?",
    options: [
      {
        style: 'constructive',
        label: "Réponds avec le brouillon, dis ce que tu attends encore, et donne une heure de fin.",
        cue: 'réponds sur le fond',
        reflection:
          "Tu as répondu à la vraie question : où en sont les choses et quand ce sera fini. Une heure précise donne à chacun un repère solide. Le ton pourra faire l'objet d'une autre discussion si cela se reproduit.",
      },
      {
        style: 'reactive',
        label: 'Réponds sur le même ton sec et mets un responsable en copie pour que le message passe.',
        cue: 'rends la pareille',
        reflection:
          "Répondre sur le même ton paraît juste sur le moment. Mettre un responsable en copie peut toutefois transformer un petit retard en conflit plus gros. Tu peux garder ton point de vue sans en faire une affaire publique.",
      },
      {
        style: 'boundary',
        label: 'Envoie le brouillon et dis que tu apprécierais un bonjour et une échéance claire la prochaine fois.',
        cue: 'nomme le ton',
        reflection:
          "Tu as fait le travail et dit comment tu aimerais qu'on te parle. Le dire poliment, c'est une limite, pas une attaque. Souvent, les gens s'ajustent quand on le leur dit simplement.",
      },
      {
        style: 'avoidant',
        label: "Laisse le message de côté tant que tu n'es pas plus calme, peut-être jusqu'à demain.",
        cue: 'évite le message',
        reflection:
          "Avoir besoin de souffler avant de répondre, c'est sensé. Mais le message sera toujours là, et le retard peut grandir. Une réponse d'une ligne maintenant protégerait ton calme tout en faisant avancer les choses.",
      },
    ],
  },
  s09: {
    situation:
      "Tu partages une anecdote drôle dans la discussion de groupe et personne ne réagit. Trois personnes étaient en train d'écrire, puis plus rien. Une minute plus tard, quelqu'un poste la photo de son déjeuner. Tu te sens rapetisser et tu hésites à supprimer ton message.",
    reframe: "Quelles sont deux autres raisons pour qu'une discussion se taise, à part ton anecdote ?",
    options: [
      {
        style: 'reactive',
        label: 'Poste une remarque ironique pour que tout le monde sache que tu as remarqué le silence.',
        cue: 'pique en retour',
        reflection:
          "Ça a fait mal, et vouloir une réaction est compréhensible. L'ironie rend plutôt un groupe plus prudent que plus chaleureux. Tu peux sentir la piqûre sans la renvoyer à toute la discussion.",
      },
      {
        style: 'constructive',
        label: 'Réagis à la photo du déjeuner et envoie ton anecdote à un ami qui va l\'apprécier.',
        cue: 'change de public',
        reflection:
          "Tu as rejoint la conversation sans courir après un rire, et tu as trouvé quelqu'un qui saura l'apprécier. Toutes les histoires ne conviennent pas à tous les groupes, ce qui en dit peu sur l'histoire, et rien sur toi.",
      },
      {
        style: 'curious',
        label: 'Dis-toi que les autres sont peut-être juste occupés, et regarde la suite.',
        cue: 'reste curieux',
        reflection:
          "Chercher d'autres explications est une bonne habitude : une discussion se tait souvent pour des raisons banales. Attendre, c'est très bien. Si ça te trotte encore dans la tête plus tard, une question amicale à une personne peut trancher.",
      },
      {
        style: 'avoidant',
        label: "Mets la discussion en sourdine pour un mois et décide de n'y plus rien partager.",
        cue: 'fais silence',
        reflection:
          "Prendre du recul avec un groupe qui t'a froissé est sensé. En faire une règle définitive transforme pourtant une minute de silence en porte fermée. Une courte pause laisse la place d'y revenir quand ce sera plus léger.",
      },
    ],
  },
  s10: {
    situation:
      "Ta boîte mail est restée fermée depuis lundi. Tu sais que deux messages demandent une réponse. Chaque fois que tu déverrouilles ton téléphone, le compteur de non-lus semble avoir grossi, et regarder la météo ou l'actualité paraît tellement plus facile.",
    reframe: 'Quel message, une fois traité, ferait paraître la pile plus légère ?',
    options: [
      {
        style: 'curious',
        label: "Avant d'ouvrir quoi que ce soit, devine ce que tu vas trouver, puis ouvre un message et compare.",
        cue: 'teste ta supposition',
        reflection:
          "L'appréhension imagine souvent pire que la réalité. Comparer un message à ta supposition est une façon douce d'entrer, et le suivant fait moins peur. Tu pourras continuer si tu en as envie.",
      },
      {
        style: 'avoidant',
        label: 'Coupe les notifications et promets-toi une vraie séance de tri dimanche.',
        cue: 'remets à plus tard',
        reflection:
          "Couper les notifications peut vraiment soulager. Dimanche est une belle promesse, mais les piles ont tendance à grossir. Si tu réponds aussi à un seul message aujourd'hui, la promesse devient bien plus facile à tenir.",
      },
      {
        style: 'constructive',
        label: 'Choisis les deux messages importants, réponds-y en dix minutes, puis ferme la boîte.',
        cue: 'deux, puis stop',
        reflection:
          "Deux réponses, c'est un vrai pas, et s'arrêter exprès fait partie du savoir-faire. Les autres messages attendront, et les deux personnes à qui tu as répondu seront contentes de te lire.",
      },
      {
        style: 'reactive',
        label: 'Ouvre tout d\'un coup et réponds vite, sèchement, pour faire tomber le chiffre.',
        cue: 'expédie tout',
        reflection:
          "Vouloir voir le chiffre baisser, c'est naturel. Des réponses rapides et sèches créent souvent de nouvelles questions. Tu n'as pas à tout vider, seulement les messages qui comptent.",
      },
    ],
  },
  s11: {
    situation:
      "Des photos d'un déjeuner d'équipe apparaissent en ligne. Personne ne t'a proposé de venir, alors que tu travailles avec presque tous ceux qu'on y voit. Personne n'en a parlé. L'après-midi paraît plus bruyant que d'habitude, et ton bureau semble loin de tout le monde.",
    reframe: 'Quelle autre raison pourrait expliquer ce déjeuner, et comment la vérifier ?',
    options: [
      {
        style: 'constructive',
        label: 'Propose un café à deux collègues cette semaine, un jour où tu peux vraiment venir.',
        cue: 'fais un plan',
        reflection:
          "Au lieu de fixer les photos, tu t'es fait une place à une prochaine table. Tu ne peux pas être de tous les déjeuners, mais tu peux toujours demander à venir au suivant.",
      },
      {
        style: 'reactive',
        label: "Commente les photos par une blague sur le fait d'être oublié, pour qu'ils sachent que tu as vu.",
        cue: 'mets-les mal à l\'aise',
        reflection:
          "Se sentir mis à l'écart fait mal, et la blague essaie de le dire. Elle risquerait pourtant de gêner les gens plutôt que de vous rapprocher. Tu peux vouloir être inclus sans faire de ces photos un piège.",
      },
      {
        style: 'curious',
        label: 'Demande-toi s\'il peut y avoir une autre raison, comme une réservation de dernière minute, avant de conclure quoi que ce soit.',
        cue: "cherche d'autres raisons",
        reflection:
          "Chercher d'autres explications t'évite d'écrire une histoire plus sombre. Ce genre de déjeuner se monte souvent à la dernière minute. C'est un bon début, et une question amicale peut transformer une hypothèse en fait.",
      },
    ],
  },
  s12: {
    situation:
      "L'addition arrive après un dîner à plusieurs. Tu as pris une salade et de l'eau ; les autres, des entrées et des desserts. Quelqu'un propose de diviser en parts égales parce que c'est plus simple. Tu peux te le permettre, mais l'injustice te travaille.",
    reframe: "Quelle phrase garderait à la fois l'amitié et les comptes honnêtes ?",
    options: [
      {
        style: 'reactive',
        label: 'Lâche à voix haute que tu paies toujours les desserts des autres, jusqu\'à ce que la table se taise.',
        cue: 'fais une blague piquante',
        reflection:
          "La blague disait la vérité de travers. L'humour peut ouvrir une porte comme la fermer, et un trait acéré laisse souvent tout le monde mal à l'aise. Tu peux toujours demander un partage plus juste.",
      },
      {
        style: 'avoidant',
        label: 'Paie ta part égale, souris, et décide de ne pas venir au prochain dîner.',
        cue: 'ne dis rien',
        reflection:
          "Payer sans rien dire semble plus simple qu'un débat. Mais si ça continue de te gêner, le coût dépasse l'argent. Tu peux revenir la prochaine fois et demander des additions séparées dès le départ.",
      },
      {
        style: 'constructive',
        label: "Propose que chacun règle son dû avec l'appli de paiement : c'est rapide et équitable.",
        cue: 'propose un partage juste',
        reflection:
          "Tu as proposé une façon pratique qui convient à tout le monde, pas seulement à toi. Comme c'est simple et neutre, personne n'a à se sentir accusé. Être juste n'a pas à être gênant.",
      },
      {
        style: 'boundary',
        label: "Dis que tu participes volontiers au pourboire, mais que tu préfères payer seulement ce que tu as pris.",
        cue: 'dis ce que tu paies',
        reflection:
          "Tu as dit oui à une partie du partage et non au reste, avec des mots simples. Entre amis, on sait entendre un chiffre clair, et la table a maintenant une option juste à accepter.",
      },
    ],
  },
  s13: {
    situation:
      "Tu fais tomber un verre sur le sol d'un café, et il se brise. Quelques personnes se retournent. Un serveur arrive déjà avec un balai. Tes joues brûlent, et pendant un instant tu voudrais disparaître sous le plancher.",
    reframe: "Dans deux jours, quelle place ce verre prendra-t-il dans la semaine de quelqu'un d'autre ?",
    options: [
      {
        style: 'constructive',
        label: 'Excuse-toi une fois, propose ton aide et paie le verre.',
        cue: 'assume simplement',
        reflection:
          "Une excuse sincère et une proposition d'aide, c'est ce qu'on attend le plus souvent. Les têtes tournées sont déjà presque toutes revenues à leur café. Tu as choisi de rester, et ça en fait un petit incident.",
      },
      {
        style: 'avoidant',
        label: "Laisse un peu d'argent sur la table et file avant qu'on te parle.",
        cue: 'esquive',
        reflection:
          "Vouloir disparaître est une réaction très courante, et payer est attentionné. Mais partir sans un mot te prive de la partie souvent la plus facile : un petit « pardon », un merci, et c'est terminé.",
      },
      {
        style: 'reactive',
        label: 'Répète tes excuses encore et encore en riant fort de ta maladresse.',
        cue: 'tourne-le en blague',
        reflection:
          "La plaisanterie aide parfois à gérer la gêne. Un long numéro demande pourtant à la salle de te rassurer. Une excuse claire suffit, et le personnel peut retourner à son service.",
      },
      {
        style: 'constructive',
        label: 'Demande ce que tu peux faire pour aider, puis reste finir ton café.',
        cue: 'reste et aide',
        reflection:
          "Rester finir ton café te montre que le moment est passé. Les cafés sont habitués à la casse. Tu as été poli, serviable, et client en même temps.",
      },
    ],
  },
  s14: {
    situation:
      "Deux proches te réclament le même samedi après-midi : l'un a besoin d'aide pour déplacer une armoire, l'autre attend une visite promise depuis longtemps. Tu as répondu « peut-être » aux deux. Ils attendent chacun une réponse et ton agenda ressemble à un nœud.",
    reframe: "Si tu ne pouvais tenir qu'une promesse aujourd'hui, laquelle te ressemblerait encore ?",
    options: [
      {
        style: 'boundary',
        label: "Dis oui à l'un pour samedi, et propose à l'autre un jour précis la semaine prochaine.",
        cue: 'un oui, un plus tard',
        reflection:
          "Tu as dit un oui clair à l'un, et un « pas samedi » clair à l'autre, avec une autre date. Ça respecte les deux personnes et tes propres limites. Personne ne peut être à deux endroits à la fois.",
      },
      {
        style: 'constructive',
        label: 'Regarde combien de temps prend chaque chose, vois si les deux tiennent, puis annonce le plan aux deux.',
        cue: 'planifie les heures',
        reflection:
          "Regarder les minutes réelles est plus doux que regarder la culpabilité. Si tout peut tenir, tu as trouvé la solution ; sinon, tu pourras le dire tôt. Dans les deux cas, chacun entend le même plan simple.",
      },
      {
        style: 'reactive',
        label: 'Écris aux deux que personne ne voit à quel point ton emploi du temps déborde et que tu ne peux pas contenter tout le monde.',
        cue: 'montre ton stress',
        reflection:
          "Être tiraillé dans deux directions fatigue, et vouloir que ça se voie est naturel. L'envoyer comme un reproche risque pourtant de faire sentir aux deux qu'ils te pèsent. Tu peux être franc sans la colère.",
      },
      {
        style: 'avoidant',
        label: "Laisse les deux messages sans réponse jusqu'à ce que samedi soit passé, puis excuse-toi.",
        cue: 'laisse passer',
        reflection:
          "Attendre semble faire disparaître le problème. Les deux proches risquent pourtant de se sentir lâchés, et une excuse après coup pèse plus qu'une réponse honnête aujourd'hui. Tu as le droit de choisir.",
      },
    ],
  },
  s15: {
    situation:
      "Ton train est supprimé et tu vas rater ta correspondance pour un déjeuner de famille. Le panneau passe de « retardé » à « supprimé » en une minute. Autour de toi, les gens soupirent et consultent leur téléphone, et ta patience s'épuise.",
    reframe: "Qu'est-ce qui dépend encore de toi entre ici et ce déjeuner ?",
    options: [
      {
        style: 'curious',
        label: "Demande à un agent combien de temps durent d'habitude les perturbations sur cette ligne.",
        cue: 'demande une info',
        reflection:
          "Demander te donne des faits plutôt que des suppositions, et c'est un bon réflexe. La suite t'appartient : avec sa réponse, tu pourras choisir entre attendre et changer d'itinéraire, au lieu de simplement t'inquiéter.",
      },
      {
        style: 'reactive',
        label: "Râle à voix haute auprès du premier agent venu sur la façon dont l'entreprise est gérée.",
        cue: 'défoule-toi',
        reflection:
          "Un train supprimé, c'est agaçant, et le personnel entend ça toute la journée. Hausser le ton accélère rarement quoi que ce soit. Une question calme te donne souvent plus vite l'information dont tu as besoin.",
      },
      {
        style: 'avoidant',
        label: 'Décide que le déjeuner est perdu et rentre chez toi sans prévenir personne.',
        cue: 'renonce',
        reflection:
          "La déception peut faire paraître un projet sans intérêt. Un train supprimé est un vrai obstacle, mais un petit message préviendrait ta famille. Même une seule ligne lui évite de deviner où tu es.",
      },
      {
        style: 'constructive',
        label: "Regarde les autres trajets, donne ta nouvelle heure d'arrivée à ta famille et prends la meilleure option.",
        cue: 'refais le trajet',
        reflection:
          "Un autre itinéraire et un message d'avance transforment une suppression en simple retard. Tu ne peux pas réparer le train, mais tu as réglé ce qui dépendait de toi. Ta famille peut s'organiser sur une heure.",
      },
    ],
  },
  s16: {
    situation:
      "La réunion avant la tienne déborde, et des gens discutent encore dans la salle que tu as réservée. Tes notes sont dans ta main et ta séance devrait déjà avoir commencé. Personne n'a levé les yeux, et les minutes filent.",
    reframe: "Quelle est la plus petite interruption qui protégerait la prochaine demi-heure pour tout le monde ?",
    options: [
      {
        style: 'reactive',
        label: 'Entre, pose ton dossier sur la table et soupire fort pour qu\'ils comprennent.',
        cue: 'montre ton impatience',
        reflection:
          "Le dépassement est agaçant, et ce retard ne vient pas de toi. Un gros soupir transforme pourtant un souci d'horaire en tension entre personnes. Tu peux entrer avec la même fermeté et un visage plus calme.",
      },
      {
        style: 'constructive',
        label: "Frappe poliment, dis à quelle heure il te faut la salle, et propose une autre salle libre si tu en connais une.",
        cue: 'propose une solution',
        reflection:
          "Proposer une solution permet aux gens de partir sans se sentir chassés. Tu as protégé ta séance tout en restant aimable avec l'équipe d'avant, ce qui facilitera aussi la prochaine fois.",
      },
      {
        style: 'avoidant',
        label: "Attends dans le couloir qu'ils aient fini, même s'il ne te reste que dix minutes.",
        cue: 'attends poliment',
        reflection:
          "La politesse est une belle qualité, et attendre paraît sûr. Si ça avale l'essentiel de ta séance, tu perds pourtant ce pour quoi tu es venu. Tu peux rester courtois et frapper à la porte.",
      },
      {
        style: 'boundary',
        label: 'Frappe, dis que ta séance commence maintenant et demande-leur de conclure sous deux minutes.',
        cue: 'réclame ton créneau',
        reflection:
          "Ton créneau est réel. Deux minutes, c'est une fenêtre polie, et le dire clairement respecte les deux groupes. Les gens peuvent ranger pendant que tu t'installes, et la plupart ne s'en offusqueront pas.",
      },
    ],
  },
  s17: {
    situation:
      "Tu as préparé un gâteau pour une petite réunion entre amis, et il sort du moule en deux morceaux. Il sent délicieusement bon. Tu l'imaginais en belle part nette dans une assiette. Les invités arrivent dans quarante minutes et ta bonne humeur est retombée.",
    reframe: 'Qu\'est-ce qui ferait encore de ce gâteau un cadeau, même en deux morceaux ?',
    options: [
      {
        style: 'constructive',
        label: 'Répartis les morceaux dans des bols avec de la crème et des fruits, et appelle ça un dessert.',
        cue: 'sers-le autrement',
        reflection:
          "Une autre façon de servir sauve le gâteau et la soirée. Les invités retiennent l'accueil plus que la forme. Tu as gardé le cadeau et lâché l'image parfaite.",
      },
      {
        style: 'curious',
        label: "Demande à un ami bon cuisinier ce qu'il ferait de deux morceaux avec quarante minutes devant lui.",
        cue: 'demande des idées',
        reflection:
          "Emprunter une idée est malin, pas un échec : les cuisiniers le font tout le temps. Quarante minutes laissent largement le choix, et tu pourras trancher dès que ton ami répondra.",
      },
      {
        style: 'avoidant',
        label: "Dis-toi que tu n'avais jamais prévu de le servir et ne propose que des biscuits.",
        cue: 'fais comme si de rien',
        reflection:
          "Cacher le gâteau protège l'image que tu avais en tête. Cela cache aussi quelque chose que tu as fait pour eux. Tu peux le servir tel quel et rester un excellent hôte.",
      },
      {
        style: 'reactive',
        label: "Jette le gâteau et en achète un parfait pour que personne ne sache que tu as essayé.",
        cue: "cache l'essai",
        reflection:
          "Être déçu après des heures d'effort, ça fait mal. Jeter ce qui a sans doute bon goût cache pourtant l'effort que tes invités apprécieraient. Un gâteau acheté, pourquoi pas, mais celui que tu as fait compte déjà.",
      },
    ],
  },
  s18: {
    situation:
      "Un voisin te demande de récupérer ses colis encore une fois et de nourrir son chat le week-end prochain. Tu l'as déjà dépanné deux fois ce mois-ci, et tu voulais un week-end tranquille. Il a l'air plein d'espoir, et tu t'entends presque dire oui.",
    reframe: "Que peux-tu offrir sans te forcer, et que dois-tu garder pour toi ?",
    options: [
      {
        style: 'avoidant',
        label: 'Réponds « peut-être, je regarde » puis évite-le dans l\'escalier pendant quelques jours.',
        cue: 'esquive la question',
        reflection:
          "Gagner du temps paraît gentil sur le moment. L'éviter rendra pourtant la prochaine rencontre plus gênante, pour vous deux. Une réponse claire, même un petit non, se reçoit mieux qu'un silence.",
      },
      {
        style: 'reactive',
        label: 'Soupire et lance que les gens profitent toujours de ta gentillesse.',
        cue: 'lance une pique',
        reflection:
          "Le ressentiment monte quand on dit oui trop souvent, et tu l'as senti. Le dire comme une accusation risque pourtant de blesser un voisin qui n'avait aucune mauvaise intention. Un simple « pas cette fois » garde de bonnes relations.",
      },
      {
        style: 'constructive',
        label: 'Dis que tu peux prendre les colis, et suggère-lui une plateforme de garde ou un autre voisin pour le chat.',
        cue: 'propose autre chose',
        reflection:
          "Tu as su rester serviable sans te surcharger, en lui donnant de vraies pistes. Aider quelqu'un à trouver une solution, c'est aussi de l'aide. Aucun de vous deux n'a à rester coincé.",
      },
      {
        style: 'boundary',
        label: 'Dis que tu veux bien prendre les colis, mais que pour le chat, ce ne sera pas possible cette fois.',
        cue: 'dis oui à une partie',
        reflection:
          "Tu as offert ce que tu pouvais et refusé le reste, gentiment. Un non net sur une partie rend ton oui sur l'autre plus sincère. Les bons voisins respectent ça, en général.",
      },
    ],
  },
};

export const FR: Record<string, ScenarioText> = Object.fromEntries(Object.entries(RAW).map(([id, text]) => [id, fr(text)]));
