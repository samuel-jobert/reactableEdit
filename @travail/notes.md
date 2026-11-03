# Reprise de session : cellules editables

Voir aussi [l'archive du chat](./chat.md) pour les demandes, decisions et justifications techniques.

## Demande et decisions

Lire `todo.md` avant de continuer : ce fichier appartient a l'utilisateur et evoluera.
Le package doit proposer une API R reutilisable, pas uniquement un exemple externe.

Decisions confirmees pendant le chat :

- Six editeurs : texte, nombre, liste a choix unique, case a cocher, date, texte multiligne.
- Champs toujours visibles.
- Veritables widgets Shiny et bindings natifs, compatibles avec `input[[id]]`,
  `observeEvent()` et les fonctions `update*Input()`.
- Identifiant par defaut : `<tableau>_<identifiantStableLigne>_<nomColonne>`.
- Prefixe personnalisable et surcharge de l'identifiant d'une cellule.
- Soumission a la sortie du champ ou avec Entree ; immediatement pour case a cocher et liste.
- Chaque modification doit etre acceptee ou refusee par R. Afficher l'attente et les erreurs.
- L'application gere validation metier et sauvegarde ; le package ne fournit pas de stockage.

L'API proposee initialement etait `rowId`, `editable`, `editor`, `editorOptions`,
`getReactableEdit()` et `resolveReactableEdit()`. Les identifiants individuels s'ajoutent a ce contrat.
L'utilisateur a confirme l'exclusion initiale de `server = TRUE` et `.subRows`, ainsi que la limite des
fonctions `update*Input()` aux cellules montees dans le DOM.

## Points techniques verifies

- `srcjs/Reactable.js` gere deja les messages de `updateReactable()` et l'etat du tableau.
- `srcjs/columns.js` accepte des composants React comme contenu des cellules.
- `RowDetails` appelle deja `Shiny.bindAll()` et `Shiny.unbindAll()` pour du contenu dynamique.
- Les lignes DOM sont recyclees selon leur position visible : un editeur doit avoir une cle stable.
- `updateReactable(data = ...)` remet par defaut a zero page, selection et expansion :
  ne pas l'utiliser tel quel pour confirmer une seule cellule.
- Il faut laisser Shiny gerer le DOM interne de ses widgets, sans champs controles par React.
- Les bindings Shiny exposent `getValue`, `setValue`, `subscribe`, `unsubscribe` et `receiveMessage`.
- Les inputs nombre et date utilisent respectivement les types `shiny.number` et `shiny.date`.
- `Shiny.bindAll()` peut etre asynchrone : gerer montage/demontage et erreurs.
- Les widgets hors de la page affichee ne sont pas presents dans le DOM : definir les limites de
  `update*Input()` dans ce cas, et conserver les modifications en attente au niveau du tableau.

## Environnement et validation

- Windows / PowerShell, depot courant `C:\Users\samue\Documents\Projects\reactable`.
- Rscript disponible : `C:\Program Files\R\R-4.5.3\bin\Rscript.exe`.
- Version du package : `0.4.5.9000`.
- `npm test` a initialement echoue car Jest etait absent. Dependances restaurees avec
  `npm install --no-audit --no-fund --package-lock=false`.
- Node 20.11.1 : avertissement moteur d'une dependance ESLint lors de l'installation.
- Shiny 1.14.0. Les dependances manquantes devtools, testthat, reactR, crosstalk et dplyr ont ete restaurees.
- `devtools::document()` a ete execute. Roxygen2 8.1.1 signale des methodes S3 preexistantes sans tags d'export.
  Les modifications de documentation sans rapport avec l'API ont ete retirees.
- Les fichiers de ce repertoire et `design/` sont exclus du package par `.Rbuildignore`.

## Implementation actuelle

- `R/editing.R` : templates natifs, validation des cles, `getReactableEdit()` et `resolveReactableEdit()`.
- `R/columns.R`, `R/reactable.R` : `editable`, `editor`, `editorOptions`, `inputId`, `rowId`, `inputIdPrefix`.
- `srcjs/CellInput.js` : cycle de vie Shiny, subscription adaptee au commit, recepteur natif decore par element,
  brouillons, attentes, erreurs, types et IDs. Le DOM interne n'est pas controle par React.
- `srcjs/Reactable.js` : editeurs sur les cellules feuilles, patches par cle stable, invalidation sur remplacement
  des donnees, conservation d'etat et recalage sur la derniere page si un filtre supprime la page courante.
- `reactableLang()` expose les libelles d'edition, statuts et erreur de date.
- Documentation R generee, NEWS, vignette et design mis a jour.
- `@travail/app.R` lance le code de demonstration de `design/cell-editing/cell-editing-test.Rmd`.
  Le lanceur ne duplique pas l'application et ne remplace pas le package installe.
- `webpack.config.server.js` utilise maintenant des externals CSS explicites `var {}` :
  la forme `{}` preexistante echouait avec le webpack restaure. Les deux bundles sont reconstruits.

## Details a conserver lors d'une reprise

- Un edit est une demande, pas une sauvegarde automatique. L'application doit valider et maintenir sa source de donnees.
- Les reponses sont associees a `editId`; un remplacement complet des donnees invalide les demandes precedentes.
- Les fonctions natives `update*Input()` ne doivent pas transformer un changement de placeholder en sauvegarde de brouillon.
- L'initialisation d'un widget remonte ne doit pas publier un brouillon jamais soumis.
- Texte/nombre restent read-only en attente pour garder le focus ; liste/case/date sont desactives.
- Les dates tapees se valident sur blur/Entree. La selection dans le calendrier se valide une fois le champ quitte.
- Le datepicker natif doit avoir `data-date-force-parse=false` : sinon sa fermeture retablit l'ancienne date
  avant que le commit differe ne lise la saisie.
- Ne pas appeler `binding.getState()` pour lire le format de date : la version Shiny/datePicker installee
  leve une erreur interne sur `.format.parts`. Comparer la saisie au texte formate par le widget suffit.
- La decoration du binding utilise un Proxy qui conserve le recepteur natif de toutes les methodes :
  `Object.create(binding)` casse les champs prives de Shiny 1.14 lors de `unsubscribe()` au demontage.
- Conserver le noeud DOM dans une variable locale avant `await Shiny.bindAll(scope)` :
  React efface la ref au demontage. Si le binding termine ensuite, nettoyer ce scope capture et non `this.el`,
  sinon des bindings detaches restent enregistres et Shiny signale des IDs dupliques au prochain defilement.
- Dans les exemples, convertir les facteurs destines a recevoir du texte libre en caracteres.
- Comparer les anciennes valeurs numeriques sans distinguer entier R et double : JSON peut convertir 25.0 en entier.
- Les nombres synchronisent aussi leur attribut HTML `value`, sinon le nom accessible de la cellule peut rester
  celui du template au lieu de sa valeur reelle.

## Verification effectuee

- Tests Jest cibles de `CellInput.test.js` : 24 tests verts, y compris nettoyage asynchrone du scope detache,
  conservation du recepteur natif, IDs dupliques et edition indisponible hors Shiny.
- ESLint des fichiers JavaScript modifies : sans erreurs ni avertissements au dernier passage.
- Prettier applique aux fichiers JavaScript modifies.
- `npm run build` : client et serveur compiles avec succes, bundles et source maps persistants.
- Tests R cibles `editing|columns|shiny|language|reactable$` : 640 assertions reussies, aucune erreur ;
  deux tests statiques/serveur ignores parce que V8 n'est pas installe.
- Tests JS de regression Reactable/columns/language : 368 reussis, 5 echecs connus hors edition.
  Deux tests Emotion/styles echouaient deja avant implementation ; trois tests de formatage attendent en-US
  alors que l'environnement Node utilise fr-FR. Ne pas masquer ces echecs ni modifier le formatage du package.
- Vraie application Shiny dans le navigateur : les six types, dates ISO, texte normalise, refus de prix negatif,
  confirmation, observation individuelle et `updateNumericInput()` ont ete verifies.
- Changement de placeholder via `updateTextInput()` pendant un brouillon : aucune soumission et donnees confirmees intactes.
- Module Shiny + defilement virtuel verifies avec les derniers bundles : soumission par blur et evenement Entree,
  observation individuelle, confirmation, mise a jour numerique native sans nouvel edit, puis edition de date.
- Trois allers-retours virtuels ont demonte puis remonte la premiere ligne : valeur restauree, aucun nouvel edit,
  aucune erreur JavaScript ni avertissement Shiny d'ID duplique.
- Le navigateur integre masquait parfois la page : frappes et animation frames ne progressaient pas normalement.
  Les verifications finales utilisent le blur natif, des evenements DOM clavier/scroll explicites et un polling temporel.
  Ne pas confondre cette limite de l'outil avec un defaut des listeners ; ne pas appeler directement `commit()` pour tester.

## Etat de livraison

Les fichiers et bundles sont enregistres dans le depot de travail. Aucun commit n'a ete demande.
Le serveur Shiny temporaire de verification a ete arrete ; relancer la demonstration avec `runEditingDemo()`.
Les cinq echecs de regression JS ci-dessus restent connus ; la conformite WCAG complete demande une revue manuelle.
Les limites fonctionnelles confirmees restent `server = TRUE`, `.subRows` et les updates de cellules non montees.

Commandes de verification JavaScript depuis la racine :

```powershell
npx prettier --check srcjs\CellInput.js srcjs\__tests__\CellInput.test.js srcjs\Reactable.js srcjs\language.js
npx eslint srcjs\CellInput.js srcjs\__tests__\CellInput.test.js srcjs\Reactable.js srcjs\language.js
npx jest --runInBand --runTestsByPath srcjs\__tests__\CellInput.test.js
npm run build
```

## Evolution : indicateurs et validation facultative (2026-11-02)

Contrat confirme par l'utilisateur :

- `colDef(editValidation = TRUE)` : reponse serveur obligatoire par defaut.
- `editValidation = FALSE` : soumission appliquee localement, inputs et evenement global toujours envoyes.
  Pas de tick de verification serveur ; resolutions ignorees. Validation et sauvegarde applicatives restent necessaires.
- `editStatus = "icon"` par defaut ; variantes `"text"` et `"none"`.
- Tick vert en haut a droite du champ apres acceptation, pendant `editStatusDuration = 2000` millisecondes.
- Duree `0` : garder jusqu'a la nouvelle saisie. Le remontage ne doit pas relancer le delai.
- Attente neutre, refus avec icone et message. Tout ancien succes ou erreur disparait des la reprise de saisie.
- Pas de validation des brouillons ; contraintes locales uniquement a la soumission.
- Variables CSS pour couleurs et position ; messages accessibles conserves meme sans indicateurs visuels.

Implementation : timestamp `savedAt` dans le record du tableau et timer de rendu nettoye au demontage.
Les labels natifs vides sont masques pour ancrer le badge au champ plutot qu'a une ligne de label vide.
La demo montre les modes differents : Price icone 2 s, Manufacturer texte 5 s, Available aucun,
Notes application locale avec sauvegarde via l'observateur.

Validation de cette evolution :

- 32 tests Jest reussis, y compris les seuils exacts 2000/500 ms, duree persistante, delai restant au remontage,
  annulation des anciens timers, effacement des erreurs et mode sans validation par colonne.
- 273 assertions R reussies dans `editing|columns`.
- `devtools::document()` execute ; modifications roxygen sans rapport retirees comme precedemment.
- Prettier, ESLint et builds client/serveur reussis.
- Vraie application Shiny en module + virtuel : tick vert positionne a droite du champ, disparition,
  absence d'erreur pendant un brouillon negatif, refus apres soumission, effacement en reprenant la saisie.
- Mode texte et CSS personnalise verifies ; Notes appliquee sans attente ni tick, evenement recu par R.
- Le port 5873 etait occupe : serveur temporaire lance sur 5874, sans arreter le processus occupant 5873.
  Le serveur temporaire sur 5874 a ensuite ete arrete.

Les limites et cinq echecs historiques de regression decrits plus haut ne sont pas resolus par cette evolution.

## Evolution : inputs disabled (2026-11-02)

Demande : desactivation a la construction et dans les updates, par ligne, colonne ou cellule,
ainsi que commandes par ID et compatibilite shinyjs.

Contrat confirme :

- `colDef(inputDisabled = TRUE)` : defaut de colonne.
- `reactable(disabledInputs = list(rows = ..., columns = ..., cells = ...))`.
  Les lignes sont des cles stables character, non des indices visuels.
- `cells = list(car1 = "Price")` desactive une cellule.
  `cells = list(car1 = list(Price = FALSE))` reactive une exception dans une ligne/colonne desactivee.
- `updateReactable(disabledInputs = ...)` remplace les regles et efface les exceptions par ID.
  `list()` efface les regles du tableau, pas les defauts de colonne ; `NULL` ne change rien.
- `updateReactableInput(session, inputId, disabled = TRUE/FALSE)` delegue a `sendInputMessage()`.
  Les fonctions natives `update*Input()` gardent leur signature sans argument disabled.
- `session$sendInputMessage(id, list(value = ..., disabled = TRUE))` combine les deux mises a jour.
- `shinyjs::disable()/enable()` : observer les changements DOM et conserver l'exception par cellule.
  La derniere commande par ID est prioritaire sur les regles ; elle exige un input monte.
- Desactivation : annuler le brouillon non soumis, restaurer la valeur confirmee, ne pas soumettre.
- Laisser finir une demande deja envoyee, sans reactiver le champ.
- Regles et exceptions par ID survivent a pagination, virtuel et remplacement complet des donnees.

Implementation dans `CellInput.js` : regles et overrides par cle stable dans le controleur du tableau.
Le composant distingue le disabled applicatif des verrouillages temporaires de pending.
Un MutationObserver filtre ses propres changements grace a `expectedDisabled`, pour ne pas transformer
une attente de validation en verrouillage permanent. Le datepicker est ferme lors de la desactivation.
Pour les messages combines, appliquer la valeur native avant le disabled evite de restaurer l'ancienne valeur.
`setValue()` conserve l'etat `updating` englobant pour ne pas publier un changement programmatique comme une edition.

Validation :

- 45 tests d'edition, 23 tests de virtuel : 68 tests JavaScript reussis.
- 365 assertions R reussies dans `editing|columns|shiny`.
- Generation des docs R, Prettier, ESLint et builds client/serveur reussis.
- Les tests interagissant avec une nouvelle page attendent maintenant la fin du binding natif avant de saisir.
- Application Shiny reelle sur 5875, mode module + virtuel : regles initiales, exception de cellule active,
  annulation de brouillon sans evenement, helper par ID, message combine et updateNumericInput sur input disabled.
- shinyjs absent au depart ; installe pour la verification reelle, sans ajout aux dependances du package.
- Vrais boutons `shinyjs::disable()` et `enable()` verifies dans le module : annulation du brouillon,
  persistance apres demontage/remontage et reactivation d'une cellule dans une colonne desactivee.
- Deux allers-retours virtuels supplementaires : aucune erreur JavaScript ni ID duplique.
- Effacement des regles : exceptions par ID supprimees, defaut de colonne toujours respecte.

Les deux serveurs temporaires de verification sur 5875 ont ete arretes avant de rendre la main.
Les cinq echecs historiques hors edition restent documentes plus haut. Aucun commit demande.

## Ajout 1 : actions sur les lignes

Le fichier utilisateur `todo.md` a ete lu sans etre modifie.
Decisions confirmees : ajout sur demande, ligne complete et cle generees par R, aucune deuxieme validation ;
suppression locale apres confirmation puis notification serveur ; IDs automatiques avec surcharges facultatives ;
ajouts epingles hors tri/filtre/groupement/pagination jusqu'au prochain remplacement complet.
Options independantes, suppression desactivable par cle. Entree multiligne conservee ; Ctrl/Cmd+Entree soumet.

API : `rowActions = list(add = TRUE, remove = TRUE, removeDisabled = c("car1"))`,
`getReactableRowAction()`, `addReactableRow()`, remplacement des options dans `updateReactable()`.
Le canal d'evenement est `<outputId>__reactable__row_action`, avec `action` et `requestId` ;
la suppression contient aussi `rowId` et `data`. Les reponses utilisent le message existant `__reactable__<outputId>`.
`addReactableRow(error = ..., requestId = ...)` libere le bouton et affiche une erreur.
Omettre requestId permet l'ajout a l'initiative du serveur. Un remplacement complet invalide la demande precedente.

Implementation :

- `R/row-actions.R` : configuration, evenements, ligne JSON et IDs locaux au module, noms de lignes R.
- `srcjs/RowActions.js` : demandes/reponses, validation de schema/types/choix/cles/IDs et collisions DOM,
  suppression et remappage des selections/expansions numeriques.
- Deux plugins react-table separent les ajouts avant les transformations et les restaurent pour selection/etat/export.
  Ne pas filtrer `rowsById` par appartenance aux seules lignes racines : cela casserait les sous-lignes ordinaires.
  Ne pas faire `regular.includes(row)` pour chaque entree : risque quadratique sur les tableaux sans cette option.
- Les ajouts reutilisent `prepareRow()` et les editeurs natifs, avec les flags de placeholder de groupement neutralises.
- Les metadonnees R pre-calculees suivent l'index source initial par cle, meme apres suppression.
  Les ajouts utilisent les valeurs brutes sans details R pre-calcules. Les renderers JS restent applicables.
  Le remplacement complet retablit les conventions positionnelles existantes.
- La pagination et son compteur excluent les ajouts. `pageRows` contient les ajouts visibles ;
  `sortedData` les contient a la fin ; selection et CSV les incluent.
- La section epinglee doit avoir un selecteur CSS plus specifique que `.Reactable .rt-tbody`,
  sinon son `overflow: visible` masque notre `overflow: auto`.
  En virtuel, limiter a `min(45vh, 50%)` : 45vh seul peut depasser un petit tableau et cacher les premieres lignes.
- Le focus apres suppression vise le prochain bouton actif, sinon le precedent ou Ajouter.
- L'application demo persiste ajouts/suppressions dans le meme reactiveVal que les edits.
  Elle expose le dernier evenement, un ID personnalise et un bouton d'integration des ajouts.

Validation actuelle :

- 85 tests JS cibles reussis : 62 edition/actions et 23 virtuel.
- Regression elargie : 452 reussis, cinq echecs deja connus (deux Emotion, trois locale fr-FR).
- 725 assertions R reussies, deux tests V8 ignores ; documentation generee.
- Prettier et ESLint passes, bundles client et serveur reconstruits.
  Webpack avertit que l'entree client CSS + JS fait environ 255 Kio, au-dessus du seuil recommande de 244 Kio.
- Shiny reel, module : ajout automatique/personnalise, nouveau prix accepte et sauvegarde,
  recherche excluant les donnees sans masquer les ajouts, suppression annulee puis confirmee et sauvegardee,
  remplacement complet integrant les ajouts. Aucun ID duplique.
- Shiny module virtuel : section sticky visible avant/apres scroll, plusieurs ajouts parcourables
  dans leur propre zone. Les verifications de geometrie sont detaillees dans le compte rendu du chat.

Limites : pas de server-side, sous-lignes imbriquees ou Crosstalk pour ces actions.
Les permissions et le stockage restent geres par l'application ; removeDisabled n'est pas une autorisation.

Verification finale des CSS produits : six ajouts dans un tableau de 223,2 px, section de 111,6 px,
overflow auto, premier et dernier boutons visibles en parcourant la zone, position epinglee conservee,
aucun ID duplique. Les serveurs temporaires sur 5876 ont ete arretes. Aucun commit effectue.

## Tooltips riches

Choix confirmes : cellules ordinaires, inputs editables, en-tetes ; HTML personnalisable non interactif ;
survol/focus et Echap ; conteneur accessible pour les inputs disabled ;
priorite ID > cellule > ligne > colonne > colDef ; persistance pagination/virtuel/remplacement des donnees.
Noms approuves : `reactableTooltip()` et `updateReactableTooltip()`.

API dans `R/tooltips.R` :

- `reactableTooltip(content, placement = "top", maxWidth = 320, class = NULL)` ;
- `colDef(tooltip = ..., headerTooltip = ...)`, avec callback R possible pour les cellules ;
- `reactable(tooltips = list(rows = list(key = ...), columns = list(col = ...),
  cells = list(key = list(col = ...)), headers = list(col = ...)))` ;
- meme argument de remplacement dans `updateReactable()`, effacant aussi les overrides d'input ;
- `updateReactableTooltip(session, inputId, tooltip)` via sendInputMessage natif, namespace local au module.
  La propriete du message est `reactableTooltip`, retiree avant delegation au binding Shiny.

`FALSE` masque explicitement une aide. `NULL` laisse un update inchange, liste vide efface les regles.
Un changement des seules donnees conserve regles et overrides. Suppression de ligne efface son override par ID.
Les callbacks R sont pre-calcules par cle stable ou par indice sans rowId ; pas de recalcul sur edit/ajout.
Les regles de lignes/cellules exigent rowId. Les cellules groupees agregees n'ont pas d'aide de cellule feuille.

`srcjs/Tooltip.js` fournit le controleur de regles et un wrapper avec portail sous body.
Pas de nouvelle dependance. Le positionnement fixe flippe et borne le popup dans le viewport.
ResizeObserver observe popup et cible, scroll/resize repositionnent. Les listeners/timers/portails sont nettoyes.
Les cellules normales et conteneurs disabled sont focusables ; les inputs actifs gardent leur focus natif.
Un MutationObserver suit disabled sans rerendre React ; un autre preserve aria-describedby avec les statuts d'edition.
Les wrappers ont une key stable par cellule : les lignes DOM recyclees ne doivent jamais garder le popup d'une autre cle.
Un clic dans le portail ne doit pas remonter au tri d'en-tete ou a la selection de ligne.
Echap capture ferme d'abord le tooltip sans annuler le brouillon ; le second Echap retrouve le comportement d'edition.

HTML de confiance uniquement ; le controle de contenu non interactif n'est pas un sanitiseur.
Les variables CSS du popup doivent etre definies sur :root ou sa classe, puisque le portail sort du tableau.
La demo Cars93 inclut maintenant Model en lecture seule et des commandes d'update par regles ou par ID.

Validation : 95 tests JS cibles reussis ; regression elargie 462 reussites et les cinq echecs historiques.
757 assertions R, deux tests V8 ignores ; documentation generee et effets roxygen sans rapport retires.
Lint et Prettier passes. Build client/serveur reussi ; entree client 264 Kio (JS 252 Kio), avertissements webpack.
Shiny reel sur 5877, module + virtuel : contenu HTML par ID, aria-describedby du statut conserve,
input disabled focusable, aucun edit parasite, override restaure apres demontage/remontage, aucun ID duplique.

Verification finale du demo avec Model : cellule ordinaire, en-tete HTML et update cible par cellule verifies.
Prix negatif refuse avec le tooltip ouvert : message d'erreur et aide restent tous deux dans aria-describedby.
Un remplacement complet des donnees conserve l'override par ID ; effacer les regles restaure l'aide de colDef.
Les serveurs temporaires sur 5877 ont ete arretes. Aucun commit effectue.
