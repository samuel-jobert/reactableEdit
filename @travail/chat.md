# Archive du chat : edition native de cellules Shiny

Date de sauvegarde : 2026-11-02.

## Nature de cette archive

Ce fichier conserve les demandes, les decisions, leurs justifications techniques et les resultats du travail.
Ce n'est pas une transcription integrale : une partie du chat a ete resumee pour liberer du contexte.
Les premiers echanges sont donc reconstruits depuis ce resume et les notes de session.
Les citations indiquees comme exactes sont disponibles dans le contexte conserve.
Les questions ci-dessous sont reformulees, sauf indication contraire.

Les justifications sont des explications techniques synthetiques et partageables, pas une transcription du
raisonnement interne de l'assistant.

## 1. Demande initiale et faisabilite

Demande utilisateur, citation exacte conservee :

> J'aime bien ce package R reactable.
> Il manque cependant certaines fonctionnalités, donc l'édition de cellules, le type d'input de cellule,
> avec les callbacks qui voont bien pournla partie serveur.
> Penses-tu que ce soit faisable d'adapter le package pour le faire ?

Reponse resumee : oui, l'architecture permet d'ajouter des editeurs de cellules et des echanges avec Shiny.
Une adaptation directe du package est possible.

Justification technique :

- React gere deja le rendu des cellules ; une cellule peut accueillir un composant d'edition.
- Le package dispose deja de communications avec Shiny et d'une API de mise a jour.
- Une cle stable doit identifier la ligne : sa position visuelle change avec le tri, les filtres et la pagination.
- La validation metier et la sauvegarde doivent rester sous le controle de l'application serveur.

## 2. Accord pour implementer et questions de cadrage

Reponse utilisateur, citation exacte conservee :

> ok vas-y, pose moi eds questions au fur et à mesure si besoin

Les questions de cadrage ont conduit aux decisions suivantes.

- Adapter le package ou fournir seulement une application exemple ?
  Decision : API R reutilisable dans le package, pour eviter une solution limitee a un seul tableau.
- Quels types de champs proposer ?
  Decision : texte, nombre, liste simple, case a cocher, date, texte multiligne.
  Justification : couvrir les besoins usuels avec les constructeurs natifs Shiny.
- Afficher les champs en permanence ou au clic ?
  Decision : champs toujours visibles.
  Justification : rendre l'edition explicite et accessible sans interaction d'activation supplementaire.
- Quand une modification devient-elle confirmee ?
  Decision : apres acceptation explicite du serveur.
  Justification : distinguer une proposition utilisateur d'une valeur validee et sauvegardee.
- Comment identifier les lignes ?
  Decision : cle stable unique obligatoire, pour ne pas confondre position affichee et enregistrement source.

Une premiere proposition reposait principalement sur un evenement global d'edition.
La lecture des besoins individuels a ensuite precise le contrat.

## 3. Prise en compte de todo.md

L'utilisateur a demande de prendre en compte [todo.md](./todo.md).
Le repertoire s'appelle litteralement `@travail`.

Les besoins comprennent des inputs Shiny dans les cellules, des identifiants configurables et des
`observeEvent()` individuels.

- Simple imitation visuelle ou vrais widgets Shiny ?
  Decision : vrais widgets et bindings natifs.
  Justification : conserver `input[[id]]`, les types Shiny et les fonctions `update*Input()`.
- Identifiant par defaut ?
  Decision : tableau + cle stable de ligne + nom de colonne.
  Justification : rester stable apres tri et filtrage et garder des noms reconnaissables.
- Personnalisation des IDs ?
  Decision : prefixe global et surcharge par cellule.
  Justification : permettre l'integration dans les conventions d'une application existante.
- Soumission des champs texte ?
  Decision : perte de focus ou Entree ; multiligne avec Ctrl/Cmd+Entree.
  Justification : ne pas envoyer une demande serveur a chaque frappe et conserver les retours a la ligne.
- Soumission des listes et cases ?
  Decision : immediate, car ces controles produisent directement un choix discret.
- Mode serveur et sous-lignes ?
  Decision : `server = TRUE` et `.subRows` exclus de cette premiere version.
  Justification : limiter le contrat initial aux donnees et lignes gerees cote client.
- Mise a jour native d'un input hors page ?
  Decision : non garantie si l'input n'est pas monte.
  Justification : un binding natif ne peut recevoir un message pour un controle absent du DOM.

L'utilisateur a aussi demande :

- [notes.md](./notes.md) pour reprendre le travail dans un autre chat ;
- [README.md](./README.md) pour expliquer les fonctionnalites ;
- de conserver [todo.md](./todo.md) comme fichier utilisateur evolutif, sans l'ecraser.

## 4. API livree

Les ajouts sont :

```r
reactable(..., rowId = "id", inputIdPrefix = NULL)

colDef(
  ...,
  editable = FALSE,
  editor = "text",
  editorOptions = NULL,
  inputId = NULL
)

getReactableEdit(outputId, session = NULL)

resolveReactableEdit(
  outputId, edit, value = edit$value, error = NULL, session = NULL
)
```

Les fonctions `reactable()` et `colDef()` ont ete etendues, pas remplacees.
Des libelles d'edition personnalisables ont aussi ete ajoutes a `reactableLang()`.

Justifications des principaux choix :

- Les templates HTML sont produits par les constructeurs R de Shiny pour conserver leurs options et dependances.
- React possede le conteneur ; Shiny possede le DOM interne de ses controles.
- Les valeurs individuelles et l'evenement global sont complementaires : observation fine et validation centralisee.
- Chaque evenement contient `editId`, `inputId`, `rowId`, `columnId`, `oldValue` et `value`.
- L'identifiant de demande permet d'ignorer une reponse devenue obsolete.
- L'acceptation modifie une cellule sans remplacer toutes les donnees ni reinitialiser le tableau.
- Les brouillons et demandes en attente vivent au niveau du tableau pour survivre aux demontages de cellules.
- Un remplacement complet des donnees invalide les demandes precedentes et efface les brouillons.
- Les changements issus de `update*Input()` ne sont pas presentes comme de nouvelles editions utilisateur.
- Un changement d'option, comme un placeholder, ne doit pas sauvegarder un brouillon.

L'application doit toujours verifier les droits, les identifiants, les types, les choix et les regles metier,
puis sauvegarder sa source de donnees avant d'accepter une edition.

## 5. Problemes rencontres et corrections

### Dependances de developpement absentes

Les dependances JavaScript et plusieurs packages R necessaires aux tests etaient absents.
Ils ont ete restaures pour executer les validations existantes.
Aucune nouvelle dependance JavaScript d'execution n'a ete ajoutee.

### Compilation serveur et CSS

La configuration des externals CSS a ete rendue explicite avec `var {}`.
La forme precedente echouait avec le webpack restaure.
Le comportement voulu reste d'ignorer ces imports dans le bundle serveur.

### Date saisie puis perdue

La fermeture du calendrier natif pouvait restaurer l'ancienne date avant la lecture de la saisie.
La correction desactive le parsing automatique a cette etape et declenche le parsing natif au commit.
La validation compare aussi la saisie au texte formate pour refuser une date invalide ou normalisee implicitement.

La lecture du format via `binding.getState()` a ete abandonnee :
elle provoquait une erreur interne avec la combinaison Shiny/datePicker installee.

### Recepteur des methodes natives Shiny

Une decoration avec `Object.create(binding)` cassait certaines methodes utilisant des champs prives.
La decoration utilise maintenant un Proxy deleguant les methodes avec leur recepteur natif.
Un test protege notamment `unsubscribe()` contre ce probleme.

### Nettoyage asynchrone et defilement virtuel

Un binding pouvait terminer apres le demontage de sa cellule.
React avait alors efface la ref, ce qui empechait le nettoyage du bon conteneur.
Des bindings detaches restaient enregistres et Shiny signalait des IDs dupliques au remontage.

La correction capture le noeud DOM avant `await Shiny.bindAll(scope)` et nettoie ce meme scope ensuite.
Le test asynchrone verifie desormais l'absence de controle encore lie dans le scope detache.

### Limites du navigateur de test

Des frappes et animations ne progressaient pas normalement lorsque la page integree etait masquee.
Cela avait initialement fait suspecter des listeners manquants.
Les derniers essais ont utilise le blur natif et des evenements DOM clavier/scroll explicites.
Ils ont verifie le chemin evenementiel sans appeler directement la methode interne `commit()`.

### Types et accessibilite

- Les anciennes valeurs numeriques sont comparees sans distinguer entier R et double venant de JSON.
- L'attribut HTML `value` des nombres est synchronise pour eviter une valeur accessible restee sur le template.
- Les controles disposent de libelles et de descriptions de statut ou d'erreur.
- La conformite WCAG complete, notamment du calendrier natif, reste a verifier manuellement.

## 6. Verification finale

Resultats obtenus avant cette sauvegarde :

- 24 tests JavaScript cibles reussis.
- 640 assertions R reussies ; deux tests ignores car V8 est absent.
- Prettier et ESLint passent sur les fichiers JavaScript modifies.
- Bundles client et serveur reconstruits avec succes.
- `git diff --check` sans erreur.
- Six types d'editeurs testes dans une vraie application Shiny.
- Refus serveur, nouvelle tentative, normalisation et observation individuelle verifies.
- Mises a jour natives de valeur et d'option verifiees sans edition utilisateur parasite.
- Module Shiny et defilement virtuel testes ensemble.
- Trois allers-retours virtuels : valeur restauree, aucun nouvel edit, aucune erreur JavaScript ni ID duplique.
- Serveur de test temporaire arrete.
- Aucun commit effectue.

La suite JavaScript de regression plus large n'est pas integralement verte : 368 tests reussis et cinq echecs.
Deux concernent les styles/Emotion et etaient deja observes avant l'implementation.
Trois concernent des attentes en-US alors que Node utilise fr-FR.
Ces echecs n'ont pas ete masques en modifiant le comportement de formatage du package.

## 7. Utilisation et limites

Depuis la racine du depot, dans R :

```r
source("@travail/app.R")
runEditingDemo()

# Variante avec module et defilement virtuel
runEditingDemo(virtual = TRUE, module = TRUE)
```

Le lanceur charge le package de developpement sans remplacer une installation existante.

Les limites initiales restent :

- pas de `server = TRUE` ni de `.subRows` ;
- `update*Input()` seulement pour les cellules montees ;
- edition indisponible dans un HTML autonome sans session Shiny ;
- stockage et validation metier a la charge de l'application.

La lecture de [todo.md](./todo.md) lors de cette sauvegarde montre aussi une demande d'ajout/suppression de lignes.
Cette fonctionnalite n'a pas ete implementee dans la livraison decrite ici.
La regle du multiligne reste Ctrl/Cmd+Entree pour soumettre ; Entree simple insere une nouvelle ligne.
Un changement de cette regle devra etre confirme avant implementation.

## 8. Demande de sauvegarde du chat

Demande utilisateur, citation exacte :

> Je veux bien que tu enregistres ce chat dans @travail, avec tes réflexions/reasoning sur chaque question/point aussi

Reponse apportee : sauvegarder ce compte rendu avec les decisions et leurs justifications techniques,
en distinguant les citations disponibles des echanges reconstruits.
Le raisonnement interne detaille n'est pas inclus.

Cette demande porte sur la documentation ; elle ne declenche pas de nouvelle fonctionnalite ni de commit.

## Documents associes

- [Guide utilisateur](./README.md)
- [Notes techniques de reprise](./notes.md)
- [Besoins utilisateur](./todo.md)
- [Lanceur de demonstration](./app.R)
- [Design et plan de test](../design/cell-editing/cell-editing.md)
- [Application et cas de test manuels](../design/cell-editing/cell-editing-test.Rmd)

## 9. Evolution demandee : remplacer le statut texte par un tick

L'utilisateur a demande un petit tick vert en haut a droite du champ apres acceptation,
des indicateurs personnalisables, et aucune ancienne validation ou erreur pendant une nouvelle saisie.

Questions et decisions confirmees :

- Implementer maintenant, avec documentation et tests.
- Proposer des modes icone, texte et aucun, avec couleurs et position personnalisables via CSS.
- Effacer le succes au bout de 2 secondes par defaut, avec duree configurable.
- Afficher une attente discrete et neutre avant la reponse serveur.
- Permettre de desactiver l'attente de validation serveur par colonne.
- Apres refus, conserver une icone et un message sous le champ ; les effacer des la nouvelle saisie.

Le contrat et les noms ont ensuite ete proposes et acceptes :
`editValidation`, `editStatus` et `editStatusDuration`.
Une duree `0` conserve le succes jusqu'a la prochaine saisie.
Sans validation serveur, une soumission valide est appliquee localement et notifie Shiny, sans tick de verification.
Les controles locaux restent effectues a la soumission, pas pendant la frappe.

Justifications techniques :

- Ne pas presenter l'application locale d'une valeur comme une validation ou une sauvegarde serveur.
- Distinguer visuellement attente neutre, succes et refus, sans utiliser uniquement la couleur.
- Conserver les annonces accessibles lorsque les indicateurs visuels sont masques.
- Conserver un timestamp d'acceptation pour eviter de relancer les 2 secondes au remontage d'une cellule.
- Annuler les timers devenus obsoletes pour ne pas effacer un succes plus recent.
- Reutiliser les patches de cellules et notifications Shiny existants dans le mode sans attente serveur.

Resultats : 32 tests JavaScript et 273 assertions R cibles reussis, lint/format/builds reussis,
verification reelle de Shiny pour le tick, sa position et ses couleurs, son expiration,
le refus et la reprise de saisie,
le mode texte et les notifications du mode sans validation.
Les documents de design, API, exemples et reprise ont ete mis a jour.

## 10. Evolution demandee : desactivation des inputs

L'utilisateur a demande de pouvoir rendre les inputs disabled par ligne, colonne ou cellule,
a la construction du tableau et lors des mises a jour, y compris via des commandes par ID ou shinyjs.

La limite des fonctions natives Shiny a ete explicitee :
les signatures de `update*Input()` n'offrent generalement pas d'argument `disabled`.
Une fonction dediee et la prise en charge du message natif `disabled` ont donc ete proposees.

Questions et reponses confirmees :

- Priorite : une cellule peut reactiver une exception dans une ligne ou colonne desactivee.
- Brouillon non soumis : l'annuler et restaurer la valeur confirmee, sans soumission.
- Validation deja en cours : laisser arriver la reponse, mais garder le champ desactive.
- Commandes externes : conserver leur effet apres pagination ou demontage virtuel.
- API proposee : validee.

API implementee :

- `colDef(inputDisabled = TRUE)` ;
- `reactable(disabledInputs = list(rows = ..., columns = ..., cells = ...))` ;
- meme configuration dans `updateReactable()` ;
- `updateReactableInput(session, inputId, disabled = TRUE/FALSE)` ;
- `session$sendInputMessage(id, list(disabled = TRUE))`, eventuellement combine avec `value` ;
- changements DOM issus de shinyjs, sans ajouter shinyjs aux dependances du package.

Les booleens par cellule sont prioritaires sur les lignes et colonnes.
La derniere commande par ID devient une exception prioritaire ; remplacer les regles du tableau efface ces exceptions.
Les commandes par ID exigent un input monte, alors que les regles du tableau ciblent aussi les cellules hors page.

Justifications techniques :

- Des cles stables evitent de desactiver la mauvaise ligne apres un tri ou un filtre.
- L'attribut natif `disabled` empeche reellement l'interaction et retire le champ de la navigation clavier.
- Les verrous temporaires de validation restent distincts des regles applicatives.
- Observer les changements DOM permet la compatibilite shinyjs.
  Ignorer ses propres mutations evite un verrou permanent.
- Conserver les overrides au niveau du tableau permet leur restauration au remontage.
- Traiter la valeur avant la desactivation dans un message combine evite de perdre la nouvelle valeur serveur.
- La desactivation reste une aide d'interface ; l'application doit toujours controler les droits cote serveur.

Verification : 68 tests JavaScript reussis, dont 45 pour l'edition et 23 pour le virtuel,
et 365 assertions R reussies. Formatage, lint, documentation R et bundles verifies.
Les essais Shiny reels incluent les modules, les boutons shinyjs, l'annulation de brouillon,
les exceptions par cellule, les messages combines et la persistance apres defilement virtuel.

## 11. Ajout 1 : ajouter et supprimer des lignes

Demande exacte disponible :

> J'ai mis à jour todo.md avec la partie "Ajout 1" à troiter

Les points ci-dessous resument les clarifications confirmees ; ce ne sont pas des citations mot a mot.

- Suppression : confirmation navigateur, retrait local immediat puis evenement serveur, sans attente d'acceptation.
- Ajout : demande au serveur, retour d'une ligne complete avec cle stable generee par R, insertion sans second accord.
- IDs : schema automatique existant ; surcharges facultatives pour les cellules de la nouvelle ligne.
- Visibilite : conserver les ajouts en bas malgre tri, filtres, recherche, groupement ou changement de page.
- Integration : les garder a part jusqu'au prochain `updateReactable(data = ...)`.
- Configuration : ajout et suppression independants ; certaines lignes peuvent etre protegees de la suppression.
- Texte : pas de validation pendant la frappe. Entree/Tab/blur soumettent ; dans textarea, Entree reste un saut de ligne.
- Noms approuves : `rowActions`, `getReactableRowAction()`, `addReactableRow()`.

Justifications techniques :

- Des cles fournies par le serveur evitent les collisions et permettent de conserver sa source comme reference.
- Une section separee avant les transformations garantit la visibilite sans detruire le tri ou les filtres choisis.
- Le retour serveur complete une demande d'ajout, contrairement a la suppression qui notifie une action deja realisee.
  L'application doit donc restaurer ses donnees en cas de suppression refusee.
- Separer les demandes par requestId empeche une reponse tardive de reintroduire une ligne apres rechargement.
- Remapper les indices numeriques apres retrait conserve la selection/expansion des lignes restantes.
  Les brouillons et demandes d'edition restent identifies par leurs cles stables.
- Conserver les indices source des metadonnees R evite d'afficher les details ou styles de la ligne precedente.
- Les IDs personnalises sont verifies contre ceux du tableau et du DOM avant insertion, puis namespaces dans les modules.

Un premier test de groupement a revele que les cellules ajoutees etaient masquees comme placeholders.
La section ajoutee utilise maintenant les valeurs feuilles normales, independamment des colonnes groupees.
Le test de plusieurs ajouts virtuels a aussi revele un overflow herite trop specifique et une hauteur excessive.
La correction borne la section a la moitie de la zone du tableau et permet son propre defilement.
Mesure navigateur : tableau de 223,2 px, section de 111,6 px, 410 px de contenu accessibles par scroll ;
le premier et le dernier bouton sont atteignables. Aucun doublon d'ID.

Validation : 85 tests JS cibles et 725 assertions R reussis ; deux tests V8 ignores.
La regression elargie donne 452 reussites et les cinq echecs historiques de styles/locale.
Shiny reel verifie : module, IDs automatiques/personnalises, edition d'une nouvelle cellule, suppression annulee/confirmee,
persistance serveur, recherche et integration, puis defilement virtuel et plusieurs ajouts.
Documentation, exemple complet et bundles mis a jour. Aucun commit demande.

Le dernier controle a charge la feuille CSS effectivement produite par le build, sans styles injectes :
les six ajouts restent dans le tableau, le premier et le dernier bouton sont accessibles par defilement,
et la section reste epinglee. Les serveurs de test temporaires ont ensuite ete arretes.

## 12. Tooltips selectifs

Demande exacte :

> Il faudrait pouvoir rajouter des tooltips aux cellules qu'on veut

Les reponses aux formulaires ont confirme les points suivants :

- Contenu riche/HTML personnalisable, pas seulement un attribut title natif.
- Cellules ordinaires, inputs editables et en-tetes.
- Definition a la construction, remplacement par updateReactable, commande sur un input par ID.
- API reactableTooltip() et updateReactableTooltip().
- Ouverture survol/focus clavier, fermeture Echap, contenu non interactif.
- Aide accessible aussi pour les champs disabled via leur conteneur.
- Priorite ID > cellule > ligne > colonne > colDef, FALSE pour masquer, NULL pour un update inchange.
- Persistance avec cles stables apres pagination, virtuel et remplacement des donnees.

Justifications techniques :

- Un portail hors du tableau evite que les aides soient coupees par les zones scrollables.
- L'approche sans nouvelle bibliotheque garde le controle des bindings natifs et limite les dependances livrees.
- Un wrapper focusable rend l'aide d'un controle disabled accessible sans reactiver le controle.
- Une description tooltip s'ajoute a celle du statut d'edition, sans la remplacer.
- Une key React par cellule stable empeche la reutilisation d'un popup lors du recyclage DOM virtuel.
- La premiere pression Echap ferme l'aide sans perdre un brouillon ; la suivante annule la saisie.
- Des regles conservees au niveau du tableau permettent les mises a jour de cellules hors page.
  Le helper par ID, lui, exige un input monte comme les fonctions natives Shiny.
- Le HTML doit etre de confiance et non interactif ; un tooltip ne remplace ni un popover ni un sanitiseur HTML.

Implementation et exemples documentes dans le guide, la vignette et le design.
Le demo inclut Model en lecture seule, des aides pour les inputs/en-tetes et les commandes de mise a jour.
Validation : 95 tests JS cibles, 757 assertions R, deux tests V8 ignores.
Regression elargie : 462 reussites, cinq echecs historiques sans rapport.
Les essais Shiny reels incluent namespace de module, HTML, disabled, conservation des descriptions,
aucun edit parasite et restauration des aides par ID apres demontage/remontage virtuel.
Les bundles sont reconstruits ; webpack signale leur taille (264 Kio pour l'entree client).

Dernier essai Shiny : aide de Model en lecture seule, en-tete en gras, update de cellule,
prix negatif refuse tout en conservant la description d'erreur et celle du tooltip.
Apres remplacement complet des donnees, l'aide par ID est toujours presente.
Effacer les regles restaure l'aide par defaut de la colonne. Serveurs temporaires arretes ; aucun commit effectue.
