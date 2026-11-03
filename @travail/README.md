# reactableEdit : edition de cellules

Le package R s'appelle maintenant `reactableEdit` : utiliser `library(reactableEdit)`.
Le repertoire du projet peut garder son nom actuel. Les fonctions `reactable()`, `colDef()`,
`reactableOutput()`, l'API JavaScript `Reactable` et les options `reactable.*` conservent leurs noms.
Ne pas charger les deux packages ni melanger leurs widgets dans un meme document HTML.

Fork independant de [reactable](https://github.com/glin/reactable), cree par Greg Lin.
Les credits et la licence MIT d'origine sont conserves ; voir [LICENSE.note](../LICENSE.note).
Depot du fork : <https://github.com/samuel-jobert/reactableEdit>.

## Documentation complete

[The editing and Shiny inputs guide](../vignettes/edition.Rmd) documents each API,
les IDs automatiques/personnalises, les namespaces, `observeEvent`, tous les `update*Input`, la validation,
les regles disabled, les tooltips et les actions de lignes. Il contient une application complete avec sauvegarde reactive.
Le present fichier reste un aide-memoire et un point d'entree vers la demonstration.

## Objectif de l'extension

Integrer de vrais champs Shiny dans les cellules de reactable, avec des identifiants individuels,
des observateurs serveur et une validation explicite de chaque modification.

## Fonctionnalites implementees

- Vrais widgets Shiny : texte, nombre, liste a choix unique, case a cocher, date et texte multiligne.
- Champs toujours visibles dans les colonnes editables.
- Identifiants bases sur le tableau, une cle stable de ligne et le nom de colonne.
- Prefixe personnalisable et identifiants particuliers pour certaines cellules.
- Acces aux valeurs via `input[[id]]` et `observeEvent()`.
- Compatibilite avec les fonctions Shiny `update*Input()` correspondant aux widgets.
- Indicateur d'enregistrement et message en cas de refus par le serveur.

## Essayer la demonstration

Depuis la racine du depot, dans R :

```r
source("@travail/app.R")
runEditingDemo()
```

Le lanceur utilise `devtools::load_all()` : il teste le package modifie sans remplacer une installation existante.
Il faut les packages R de developpement ainsi que `shiny`, `MASS` et `knitr`.
Les bundles JavaScript reconstruits sont inclus dans le depot de travail.

Autres modes :

```r
runEditingDemo(virtual = TRUE)
runEditingDemo(virtual = TRUE, module = TRUE)
```

## Configurer les colonnes

```r
reactable(
  donnees,
  rowId = "id",
  columns = list(
    id = colDef(show = FALSE),
    prix = colDef(editable = TRUE, editor = "number",
                  editorOptions = list(min = 0, step = 0.01)),
    statut = colDef(editable = TRUE, editor = "select",
                    editorOptions = list(choices = c("Brouillon", "Valide")))
  )
)
```

Les autres noms d'editeur sont `"text"`, `"checkbox"`, `"date"` et `"textarea"`.
Les options sont celles des constructeurs Shiny correspondants. Les cases a cocher exigent des valeurs logiques
non manquantes ; les nombres doivent etre finis ou manquants.
La colonne `id` doit contenir des chaines uniques ou des entiers representables exactement en JavaScript.
Elle ne peut pas etre editable.

## Identifiants individuels

Pour une sortie `reactableOutput("tableau")`, la cellule `prix` de la ligne `id = "produit1"` utilise
`tableau_produit1_prix`. Sa valeur est disponible avec `input$tableau_produit1_prix`.
Les composants ligne et colonne sont encodes pour les caracteres speciaux.

- `reactable(inputIdPrefix = "saisie")` change le prefixe.
- `colDef(inputId = function(rowId, columnId) ...)` permet de nommer une cellule precise.
- Retourner `NULL` dans cette fonction conserve le nom par defaut.
- Les noms personnalises sont calcules pour les lignes initiales ; de nouvelles lignes utilisent le nom par defaut.
- Les espaces et deux-points sont interdits dans les IDs personnalises ; les doublons sont refuses.
- Les espaces de noms des modules Shiny sont appliques automatiquement.

```r
observeEvent(input$tableau_produit1_prix, {
  print(input$tableau_produit1_prix)
}, ignoreInit = TRUE)
```

## Validation et sauvegarde

`getReactableEdit("tableau")` fournit un evenement global contenant `editId`, `inputId`, `rowId`, `columnId`,
`oldValue` et `value`. L'application doit verifier la ligne, les droits, la colonne, le type et les regles metier,
puis sauvegarder les donnees avant d'accepter :

```r
observeEvent(getReactableEdit("tableau"), {
  edit <- getReactableEdit("tableau")
  # Verifier et sauvegarder dans les donnees de l'application avant de confirmer.
  resolveReactableEdit("tableau", edit)
  # Pour normaliser : resolveReactableEdit("tableau", edit, value = valeurCorrigee)
  # Pour refuser : resolveReactableEdit("tableau", edit, error = "Valeur refusee")
}, ignoreInit = TRUE)
```

Cet extrait illustre le protocole ; utiliser la demonstration pour un exemple avec validation et sauvegarde reelles.
Le package ne fournit pas de base de donnees.
Ne pas reconstruire le tableau a chaque changement des donnees sauvegardees.
Chaque soumission attend une reponse : sans `resolveReactableEdit()`, la cellule reste en attente.
Exception : `colDef(editValidation = FALSE)` applique la soumission localement sans attendre de reponse.
Les inputs et evenements Shiny restent envoyes, mais les resolutions sont ignorees et aucun tick de validation
n'apparait. L'application doit toujours valider et sauvegarder ses propres donnees.
Les dates de l'evenement global sont des chaines ISO ; les inputs individuels conservent leurs types Shiny natifs.
Utiliser `NULL` pour accepter un nombre ou une date manquants.

Texte et nombre : sortie du champ ou Entree. Texte multiligne : sortie ou Ctrl/Cmd+Entree.
Liste et case a cocher : immediatement. Date : sortie, Entree ou selection dans le calendrier.
Echap restaure la valeur confirmee sans creer un nouvel evenement d'edition.
Les brouillons et erreurs sont conserves pendant les changements de page.

## Indicateurs personnalisables

Par defaut, un petit tick vert apparait en haut a droite du champ apres acceptation serveur, pendant 2 secondes.
Pendant l'attente, un indicateur neutre apparait, sans succes ni erreur.
Des la reprise de saisie, l'ancien succes ou l'ancienne erreur disparait.
Les brouillons ne sont pas valides pendant la frappe ; les contraintes locales sont verifiees a la soumission.
Un refus affiche une icone et un message sous le champ.

```r
colDef(editable = TRUE, editStatus = "icon", editStatusDuration = 2000)
colDef(editable = TRUE, editStatus = "text", editStatusDuration = 5000)
colDef(editable = TRUE, editStatusDuration = 0)  # Jusqu'a la prochaine saisie
colDef(editable = TRUE, editStatus = "none")
colDef(editable = TRUE, editValidation = FALSE)
```

Ces options peuvent aussi etre definies dans `defaultColDef`.
Le mode `"none"` masque les indicateurs, pas les messages d'erreur ni les annonces accessibles.
Le delai part de l'acceptation serveur ; un remontage de cellule ne le relance pas.

Variables CSS disponibles dans `.rt-cell-editor` :
`--rt-edit-success-color`, `--rt-edit-error-color`, `--rt-edit-pending-color`,
`--rt-edit-indicator-top` et `--rt-edit-indicator-right`.
Les classes `.rt-cell-editor-indicator-saved`, `.rt-cell-editor-indicator-pending`
et `.rt-cell-editor-indicator-error` permettent une personnalisation plus poussee.
Conserver un contraste suffisant et ne pas utiliser la couleur comme seul signe de statut.

## Fonctions Shiny update*Input

```r
updateNumericInput(session, "tableau_produit1_prix", value = 20)
updateTextInput(session, "tableau_produit1_nom", placeholder = "Nom du produit")
```

Les fonctions natives restent utilisables. Une valeur envoyee par le serveur hors edition en attente met aussi
a jour les donnees du tableau dans le navigateur, sans creer un nouvel evenement d'edition.
L'application doit maintenir ses propres donnees en coherence.
Modifier uniquement un placeholder ne soumet pas un brouillon.
Pendant une edition en attente, `resolveReactableEdit()` reste obligatoire.

## Limites de cette premiere version

- Tables Shiny classiques, avec tri, filtres, regroupements de lignes feuilles, pagination et defilement virtuel.
- Pas de mode `server = TRUE` ni de sous-lignes `.subRows`.
- Seules les cellules montees dans le DOM peuvent recevoir `update*Input()`.
- `updateReactable(data = ...)` reste utilisable pour remplacer toutes les donnees, mais annule les editions
  en attente et efface les brouillons.
- L'edition n'est pas disponible dans un document HTML autonome sans session Shiny.
- La conformite WCAG complete, notamment du calendrier natif, demande encore une verification manuelle.

## Desactiver les inputs

```r
colDef(editable = TRUE, inputDisabled = TRUE)  # Defaut de colonne

# A la construction : reactable(..., disabledInputs = ...)
regles <- list(
  rows = c("car1", "car2"),
  columns = "Price",
  cells = list(car1 = list(Price = FALSE), car3 = "Notes")
)

updateReactable("cars", disabledInputs = regles)
updateReactable("cars", disabledInputs = list())  # Effacer regles et exceptions par ID
updateReactableInput(session, "cars_car1_Price", disabled = TRUE)
updateReactableInput(session, "cars_car1_Price", disabled = FALSE)
session$sendInputMessage("cars_car1_Price", list(value = 20, disabled = TRUE))
```

Les lignes sont ciblees par cle stable, jamais par position affichee.
Les booleens par cellule sont prioritaires sur les lignes et colonnes ; les commandes par ID sont prioritaires
sur ces regles et persistent apres pagination, defilement virtuel et remplacement des donnees.
Remplacer `disabledInputs` efface les exceptions par ID ; les defauts `colDef(inputDisabled = TRUE)` restent.
`NULL` ne modifie pas les regles. Une regle peut cibler une cle qui sera ajoutee plus tard.

La desactivation annule un brouillon non soumis et restaure la valeur confirmee, sans evenement d'edition.
Une demande deja envoyee peut recevoir sa reponse, mais ne reactive pas le champ.
Les mises a jour de valeur par le serveur fonctionnent meme sur un input desactive.

Les signatures natives de `update*Input()` restent inchangees et n'acquierent pas d'argument `disabled`.
Utiliser la fonction dediee ou `sendInputMessage()`. Dans un module, donner l'ID local a la session du module.
`shinyjs::disable()` et `shinyjs::enable()` sont compatibles si shinyjs est charge par l'application,
sans nouvelle dependance pour reactable. Leurs changements DOM sont conserves par cellule.
Toutes les commandes par ID exigent une cellule montee ; les regles du tableau couvrent aussi les cellules hors page.
La desactivation est une aide d'interface, pas une autorisation serveur.

## Ajouter et supprimer des lignes

```r
reactable(
  donnees, rowId = "id",
  rowActions = list(add = TRUE, remove = TRUE, removeDisabled = "car1")
)
```

Les options d'ajout et de suppression sont independantes et modifiables par
`updateReactable("cars", rowActions = list(...))`. `removeDisabled` contient les cles stables protegees.
Une liste vide masque les commandes sans supprimer les lignes ajoutees.

- **Ajouter** envoie une demande a R. Le serveur genere la cle et fournit une ligne complete.
- **Supprimer** demande confirmation, retire immediatement la ligne, puis notifie R.
  Le serveur doit controler les droits et sauvegarder, ou restaurer ses donnees en cas de refus.
- Les ajouts restent dans une section en bas, meme apres tri, filtre, recherche, groupement ou pagination.
  Ils n'occupent pas les places des pages normales. En virtuel, cette section reste visible et dispose de son defilement.
- `updateReactable("cars", data = saved())` integre les ajouts au fonctionnement normal du tableau.
  Ce remplacement annule brouillons et demandes en attente ; les reponses tardives sont ignorees.
  Les surcharges d'ID donnees a l'ajout sont aussi effacees ; les regles habituelles du tableau s'appliquent ensuite.
- Les IDs des nouveaux inputs sont automatiques, sauf surcharge par `inputIds`.
  Les namespaces de module sont appliques automatiquement. Les noms de lignes R sont aussi conserves.

Exemple de reponse dans le serveur :

```r
observeEvent(getReactableRowAction("cars"), {
  action <- getReactableRowAction("cars")
  if (identical(action$action, "add")) {
    # Creer une ligne complete avec une nouvelle cle ; verifier les droits et sauvegarder.
    row <- creerEtSauvegarderUneLigne()
    addReactableRow(
      "cars", row, requestId = action$requestId,
      inputIds = c(Price = paste0("nouveau_prix_", row$id))
    )
  } else if (identical(action$action, "remove")) {
    verifierEtSauvegarderLaSuppression(action$rowId)
  }
}, ignoreInit = TRUE)
```

Les fonctions `creerEtSauvegarderUneLigne()` et `verifierEtSauvegarderLaSuppression()` representent votre logique metier.
L'application de demonstration contient une implementation complete, avec stockage reactif et controle de suppression.
Pour signaler un echec de creation :
`addReactableRow("cars", requestId = action$requestId, error = "Creation impossible")`.
Sans `requestId`, le serveur peut aussi declencher directement un ajout.

Les styles et libelles se personnalisent avec `.rt-row-add`, `.rt-row-remove`, `.rt-row-action-cell`
et les options `rowAdd`, `rowRemoveLabel`, `rowRemoveConfirm`, etc. de `reactableLang()`.
Les colonnes d'action sont sans bordure. Le focus est replace sur un bouton proche apres suppression.
Les renderers R pre-calcules suivent les lignes d'origine ; les ajouts utilisent les valeurs brutes et n'ont pas
de details R pre-calcules. Les renderers JavaScript continuent a fonctionner sur les nouvelles lignes.

Le texte se soumet sur Entree, Tab ou perte du focus, jamais a chaque frappe.
Pour les champs multilignes, Entree insere une nouvelle ligne ; Ctrl/Cmd+Entree soumet.
Limites : Shiny uniquement, cles stables obligatoires, pas de traitement `server = TRUE`, `.subRows` ou Crosstalk.

## Tooltips sur les cellules et les en-tetes

```r
reactable(
  donnees, rowId = "id",
  columns = list(
    Price = colDef(
      editable = TRUE, editor = "number",
      tooltip = reactableTooltip(
        htmltools::tagList(htmltools::tags$b("Prix"), " : saisir une valeur positive"),
        placement = "right", maxWidth = 280
      ),
      headerTooltip = "Prix en milliers"
    )
  ),
  tooltips = list(
    rows = list(car2 = "Aide commune a cette ligne"),
    cells = list(car1 = list(Price = "Aide specifique a cette cellule"))
  )
)
```

Les tooltips fonctionnent sur les cellules ordinaires, les inputs editables et les en-tetes.
Un input desactive garde une aide accessible au clavier via son conteneur.
Survol ou focus affiche l'aide ; Echap la ferme. Pour un editeur, un second Echap annule le brouillon.
Le contenu reste survolable et sort des conteneurs du tableau pour eviter le rognage.

Priorite : commande par ID > cellule > ligne > colonne dans `tooltips` > `colDef()`.
`FALSE` masque explicitement le tooltip. Les cles stables suivent le tri, la pagination, le virtuel et les ajouts.
Les regles d'en-tete sont independantes des regles des cellules.

```r
updateReactable("cars", tooltips = list(
  cells = list(car1 = list(Price = reactableTooltip(htmltools::tags$em("Nouvelle aide")))),
  headers = list(Price = "Nouvelle aide de colonne")
))
updateReactableTooltip(session, "cars_car1_Price", "Aide prioritaire par ID")
updateReactableTooltip(session, "cars_car1_Price", FALSE)
updateReactable("cars", tooltips = list())  # Efface regles et overrides ; conserve les defauts colDef
```

Un update de regles les remplace et efface les overrides par ID. `NULL` ne change rien.
Un remplacement des seules donnees conserve les regles et les overrides.
Les commandes par ID necessitent un input natif monte ; elles utilisent les IDs locaux du module Shiny.
`colDef(tooltip = function(value, index, name) ...)` permet aussi de calculer le contenu en R a la construction.
Ce calcul n'est pas rejoue lors des edits/ajouts. Avec `rowId`, les resultats suivent les cles stables.

Texte simple : echappement automatique. HTML : uniquement des tags de mise en forme de confiance.
Pas de boutons, liens, inputs, scripts ou htmlwidgets ; utiliser un popover ou des details pour du contenu interactif.
Cette API n'est pas un sanitiseur HTML. Ne pas lui donner de HTML provenant d'un utilisateur.
Placement, largeur et classe CSS sont personnalisables. Pour les couleurs, utiliser `.rt-tooltip` ou une classe propre
avec `--rt-tooltip-background` et `--rt-tooltip-color`. Le popup est sous `body` : definir ces variables sur sa classe
ou sur `:root`, et non uniquement sur le conteneur du tableau.

La demo ajoute une colonne Model non editable, des aides pour les inputs/en-tetes et trois boutons de mise a jour.

## Verification

Les derniers tests cibles passent : 95 tests JavaScript (`CellInput`, `Tooltip` et defilement virtuel),
et 757 assertions R ; deux tests V8 sont ignores.
La validation precedente plus large comptait 640 assertions R reussies et deux tests ignores sans V8.
Les bundles client et serveur sont reconstruits. Les six editeurs ont ete testes avec une vraie application Shiny,
y compris un module avec demontage/remontage lors du defilement virtuel.
Les nouveaux indicateurs ont aussi ete verifies dans Shiny : position, couleur CSS, expiration, reprise de saisie,
refus serveur, mode texte et application locale sans tick.
La desactivation a ete verifiee dans Shiny avec modules, vrais appels shinyjs, exceptions par cellule,
annulation de brouillon, messages combines valeur/disabled et remontages virtuels.
Les ajouts et suppressions sont verifies dans Shiny avec modules : IDs par defaut et personnalises,
edition d'un nouveau prix, annulation/confirmation de suppression, sauvegarde serveur,
maintien sous recherche puis integration, et plusieurs lignes epinglees en defilement virtuel.
Les tooltips ont ete verifies dans le module Shiny virtuel : mise en forme HTML, descriptions accessibles conservees,
inputs desactives et override par ID restaure apres remontage sans nouvel edit ni doublon d'ID.
Le build reussit avec des avertissements de taille : JS d'environ 252 Kio et entree CSS + JS d'environ 264 Kio.
La suite de regression JavaScript plus large conserve cinq echecs preexistants ou lies a l'environnement,
documentes dans `notes.md` : 462 tests reussis, cinq echecs ; elle n'est donc pas integralement verte.

`todo.md` contient les besoins de l'utilisateur. `notes.md` contient le contexte technique pour reprendre
le travail dans une nouvelle session de chat, les commandes de test et les limites de validation connues.

Le [compte rendu du chat](./chat.md) conserve les demandes, les decisions, leurs justifications techniques
et les resultats des verifications. Il distingue les citations disponibles des echanges reconstruits depuis le resume.
