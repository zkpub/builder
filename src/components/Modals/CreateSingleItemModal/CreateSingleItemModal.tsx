import * as React from 'react'
import { basename } from 'path'
import uuid from 'uuid'
import JSZip from 'jszip'
import { BodyShape, EmoteCategory, EmoteDataADR74, WearableCategory } from '@dcl/schemas'
import { WearableData } from '@dcl/builder-client'
import {
  ModalNavigation,
  Row,
  Column,
  Button,
  Form,
  Field,
  Section,
  Header,
  InputOnChangeData,
  SelectField,
  DropdownProps,
  WearablePreview,
  Message
} from 'decentraland-ui'
import { T, t } from 'decentraland-dapps/dist/modules/translation/utils'
import Modal from 'decentraland-dapps/dist/containers/Modal'
import { cleanAssetName } from 'modules/asset/utils'
import { blobToDataURL, getImageType, dataURLToBlob, convertImageIntoWearableThumbnail } from 'modules/media/utils'
import { ImageType } from 'modules/media/types'
import {
  ITEM_EXTENSIONS,
  THUMBNAIL_PATH,
  Item,
  BodyShapeType,
  ItemRarity,
  ITEM_NAME_MAX_LENGTH,
  WearableRepresentation,
  MODEL_EXTENSIONS,
  IMAGE_EXTENSIONS,
  ItemType,
  EmotePlayMode
} from 'modules/item/types'
import { EngineType, getModelData } from 'lib/getModelData'
import { computeHashes } from 'modules/deployment/contentUtils'
import ItemDropdown from 'components/ItemDropdown'
import Icon from 'components/Icon'
import { getExtension } from 'lib/file'
import { buildThirdPartyURN, DecodedURN, decodeURN, isThirdParty, URNType } from 'lib/urn'
import { ModelEmoteMetrics, ModelMetrics } from 'modules/models/types'
import {
  getBodyShapeType,
  getMissingBodyShapeType,
  getRarities,
  getWearableCategories,
  getBackgroundStyle,
  isModelPath,
  isImageFile,
  MAX_FILE_SIZE,
  resizeImage,
  isImageCategory,
  getMaxSupplyForRarity,
  getEmoteCategories,
  getEmotePlayModes
} from 'modules/item/utils'
import ItemImport from 'components/ItemImport'
import { ASSET_MANIFEST } from 'components/AssetImporter/utils'
import { FileTooBigError, WrongExtensionError, InvalidFilesError, MissingModelFileError } from 'modules/item/errors'
import { THUMBNAIL_HEIGHT } from 'modules/editor/utils'
import EditThumbnailStep from './EditThumbnailStep/EditThumbnailStep'
import { getThumbnailType, THUMBNAIL_WIDTH, toWearableWithBlobs, validateEnum, validatePath } from './utils'
import EditPriceAndBeneficiaryModal from '../EditPriceAndBeneficiaryModal'
import {
  Props,
  State,
  CreateItemView,
  CreateSingleItemModalMetadata,
  StateData,
  SortedContent,
  ItemAssetJson
} from './CreateSingleItemModal.types'
import './CreateSingleItemModal.css'

export default class CreateSingleItemModal extends React.PureComponent<Props, State> {
  state: State = this.getInitialState()
  thumbnailInput = React.createRef<HTMLInputElement>()

  getInitialState() {
    const { metadata } = this.props

    const state: State = { view: CreateItemView.IMPORT, playMode: EmotePlayMode.SIMPLE }
    if (!metadata) {
      return state
    }

    const { collectionId, item, addRepresentation } = metadata as CreateSingleItemModalMetadata
    state.collectionId = collectionId

    if (item) {
      state.id = item.id
      state.name = item.name
      state.description = item.description
      state.item = item
      state.type = item.type
      state.collectionId = item.collectionId
      state.bodyShape = getBodyShapeType(item)
      state.category = item.data.category
      state.rarity = item.rarity
      state.isRepresentation = false

      if (addRepresentation) {
        const missingBodyShape = getMissingBodyShapeType(item)
        if (missingBodyShape) {
          state.bodyShape = missingBodyShape
          state.isRepresentation = true
        }
      }
    }

    return state
  }

  componentDidUpdate(_prevProps: Props, prevState: State) {
    const { thumbnail, file, type, isLoading } = this.state
    // when the thumbnail is loaded and the file & type are already computed, we proceed to the Details view
    if ((!prevState.thumbnail || !prevState.type) && thumbnail && file && type && !isLoading) {
      this.setState({ view: CreateItemView.DETAILS })
    }
  }

  /**
   * Prefixes the content name by adding the adding the body shape name to it.
   *
   * @param bodyShape - The body shaped used to prefix the content name.
   * @param contentKey - The content key or name to be prefixed.
   */
  prefixContentName(bodyShape: BodyShapeType, contentKey: string): string {
    return `${bodyShape}/${contentKey}`
  }

  /**
   * Creates a new contents record with the names of the contents blobs record prefixed.
   * The names need to be prefixed so they won't collide with other
   * pre-uploaded models. The name of the content is the name of the uploaded file.
   *
   * @param bodyShape - The body shaped used to prefix the content names.
   * @param contents - The contents which keys are going to be prefixed.
   */
  prefixContents(bodyShape: BodyShapeType, contents: Record<string, Blob>): Record<string, Blob> {
    return Object.keys(contents).reduce((newContents: Record<string, Blob>, key: string) => {
      // Do not include the thumbnail in each of the body shapes
      if (key === THUMBNAIL_PATH) {
        return newContents
      }
      newContents[this.prefixContentName(bodyShape, key)] = contents[key]
      return newContents
    }, {})
  }

  /**
   * Sorts the content into "male", "female" and "all" taking into consideration the body shape.
   * All contains the item thumbnail and both male and female representations according to the shape.
   * If the body representation is male, "female" will be an empty object and viceversa.
   *
   * @param bodyShape - The body shaped used to sort the content.
   * @param contents - The contents to be sorted.
   */
  sortContent = (bodyShape: BodyShapeType, contents: Record<string, Blob>): SortedContent => {
    const male =
      bodyShape === BodyShapeType.BOTH || bodyShape === BodyShapeType.MALE ? this.prefixContents(BodyShapeType.MALE, contents) : {}
    const female =
      bodyShape === BodyShapeType.BOTH || bodyShape === BodyShapeType.FEMALE ? this.prefixContents(BodyShapeType.FEMALE, contents) : {}
    const all = { [THUMBNAIL_PATH]: contents[THUMBNAIL_PATH], ...male, ...female }

    return { male, female, all }
  }

  handleSubmit = async () => {
    const { address, metadata, collection, onSave } = this.props
    const { id } = this.state

    let changeItemFile = false
    let addRepresentation = false
    let pristineItem: Item | null = null

    if (metadata) {
      changeItemFile = metadata.changeItemFile
      addRepresentation = metadata.addRepresentation
      pristineItem = metadata.item
    }

    if (id && this.isValid()) {
      const {
        name,
        description,
        model,
        thumbnail,
        bodyShape,
        contents,
        type,
        metrics,
        collectionId,
        isRepresentation,
        item: editedItem,
        category,
        playMode,
        rarity
      } = this.state as StateData

      if (this.state.view === CreateItemView.DETAILS) {
        let item: Item<ItemType.WEARABLE | ItemType.EMOTE>

        try {
          const belongsToAThirdPartyCollection = collection?.urn && isThirdParty(collection?.urn)
          const blob = dataURLToBlob(thumbnail)
          const hasCustomThumbnail = THUMBNAIL_PATH in contents
          if (blob && !hasCustomThumbnail) {
            contents[THUMBNAIL_PATH] = blob
          }

          const sortedContents = this.sortContent(bodyShape, contents)

          // Add this item as a representation of an existing item
          if ((isRepresentation || addRepresentation) && editedItem) {
            const hashedContents = await computeHashes(bodyShape === BodyShapeType.MALE ? sortedContents.male : sortedContents.female)
            item = {
              ...editedItem,
              data: {
                ...editedItem.data,
                representations: [
                  ...editedItem.data.representations,
                  // add new representation
                  ...this.buildRepresentations(bodyShape, model, sortedContents)
                ],
                replaces: [...editedItem.data.replaces],
                hides: [...editedItem.data.hides],
                tags: [...editedItem.data.tags]
              },
              contents: {
                ...editedItem.contents,
                ...hashedContents
              },
              updatedAt: +new Date()
            }

            // Do not change the thumbnail when adding a new representation
            delete sortedContents.all[THUMBNAIL_PATH]
          } else if (pristineItem && changeItemFile) {
            item = {
              ...(pristineItem as Item),
              data: {
                ...pristineItem.data,
                replaces: [],
                hides: [],
                category: category as WearableCategory
              },
              name,
              metrics,
              contents: await computeHashes(sortedContents.all),
              updatedAt: +new Date()
            }

            const wearableBodyShape = bodyShape === BodyShapeType.MALE ? BodyShape.MALE : BodyShape.FEMALE
            const representationIndex = pristineItem.data.representations.findIndex(
              (representation: WearableRepresentation) => representation.bodyShapes[0] === wearableBodyShape
            )
            const pristineBodyShape = getBodyShapeType(pristineItem)
            const representations = this.buildRepresentations(bodyShape, model, sortedContents)
            if (representations.length === 2 || representationIndex === -1 || pristineBodyShape === BodyShapeType.BOTH) {
              // Unisex or Representation changed
              item.data.representations = representations
            } else {
              // Edited representation
              item.data.representations[representationIndex] = representations[0]
            }
          } else {
            // If it's a third party item, we need to automatically create an URN for it by generating a random uuid different from the id
            let decodedCollectionUrn: DecodedURN<any> | null = collection?.urn ? decodeURN(collection.urn) : null
            let urn: string | undefined
            if (
              decodedCollectionUrn &&
              decodedCollectionUrn.type === URNType.COLLECTIONS_THIRDPARTY &&
              decodedCollectionUrn.thirdPartyCollectionId
            ) {
              urn = buildThirdPartyURN(decodedCollectionUrn.thirdPartyName, decodedCollectionUrn.thirdPartyCollectionId, uuid.v4())
            }

            // create item to save
            let data: WearableData | EmoteDataADR74

            if (type === ItemType.WEARABLE) {
              data = {
                category: category as WearableCategory,
                replaces: [],
                hides: [],
                tags: [],
                representations: [...this.buildRepresentations(bodyShape, model, sortedContents)]
              } as WearableData
            } else {
              data = {
                category: category as EmoteCategory,
                representations: [...this.buildRepresentations(bodyShape, model, sortedContents)],
                tags: [],
                loop: playMode === EmotePlayMode.LOOP
              } as EmoteDataADR74
            }

            item = {
              id,
              name,
              urn,
              description: description || '',
              thumbnail: THUMBNAIL_PATH,
              type,
              collectionId,
              totalSupply: 0,
              isPublished: false,
              isApproved: false,
              inCatalyst: false,
              blockchainContentHash: null,
              currentContentHash: null,
              catalystContentHash: null,
              rarity: belongsToAThirdPartyCollection ? ItemRarity.UNIQUE : rarity,
              data,
              owner: address!,
              metrics,
              contents: await computeHashes(sortedContents.all),
              createdAt: +new Date(),
              updatedAt: +new Date()
            }
          }

          // The Emote will be saved on the set price step
          if (item.type === ItemType.WEARABLE) {
            onSave(item as Item, sortedContents.all)
          } else {
            this.setState({
              item: { ...(item as Item) },
              itemSortedContents: sortedContents.all,
              view: CreateItemView.SET_PRICE
            })
          }
        } catch (error) {
          this.setState({ error: error.message })
        }
      } else if (this.state.view === CreateItemView.SET_PRICE && !!this.state.item && !!this.state.itemSortedContents) {
        onSave(this.state.item, this.state.itemSortedContents)
      }
    }
  }

  /**
   * Unzip files and processes the model files.
   * One of the models will be taken into consideration if multiple models are uploaded.
   *
   * @param file - The ZIP file.
   */
  handleZippedModelFiles = async (file: File) => {
    const zip: JSZip = await JSZip.loadAsync(file)
    const fileNames: string[] = []

    zip.forEach(fileName => {
      if (!basename(fileName).startsWith('.')) {
        fileNames.push(fileName)
      }
    })

    // asset.json contains data to populate parts of the state
    const assetJsonPath = fileNames.find(path => basename(path) === ASSET_MANIFEST)
    let assetJson: ItemAssetJson | undefined

    if (assetJsonPath) {
      const assetRaw = zip.file(assetJsonPath)
      const content = await assetRaw.async('text')
      assetJson = JSON.parse(content)
    }

    const modelPath = fileNames.find(isModelPath)

    const files = await Promise.all(
      fileNames
        .map(fileName => zip.file(fileName))
        .filter(file => !!file)
        .map(async file => {
          const blob = await file.async('blob')

          if (blob.size > MAX_FILE_SIZE) {
            throw new FileTooBigError()
          }

          return {
            name: file.name,
            blob
          }
        })
    )

    const contents = files.reduce<Record<string, Blob>>((contents, file) => {
      contents[file.name] = file.blob
      return contents
    }, {})

    if (!modelPath) {
      throw new MissingModelFileError()
    }

    const result = await this.processModel(modelPath, contents)

    return [...result, assetJson] as const
  }

  /**
   * Processes a model file.
   *
   * @param file - The model file.
   */
  handleModelFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      throw new FileTooBigError()
    }

    const modelPath = file.name
    const contents = {
      [modelPath]: file
    }

    return this.processModel(modelPath, contents)
  }

  handleDropAccepted = async (acceptedFiles: File[]) => {
    const { metadata } = this.props
    const { isRepresentation, category } = this.state

    let changeItemFile = false
    let item = null

    if (metadata) {
      changeItemFile = metadata.changeItemFile
      item = metadata.item
    }

    const file = acceptedFiles[0]
    const extension = getExtension(file.name)

    try {
      this.setState({ isLoading: true, file })

      if (!extension) {
        throw new WrongExtensionError()
      }

      const handler = extension === '.zip' ? this.handleZippedModelFiles : this.handleModelFile
      const [, model, metrics, contents, type, assetJson] = await handler(file)

      this.setState({
        id: changeItemFile ? item!.id : uuid.v4(),
        name: changeItemFile ? item!.name : cleanAssetName(file.name),
        model,
        metrics,
        contents,
        type,
        bodyShape: type === ItemType.EMOTE ? BodyShapeType.BOTH : undefined,
        error: '',
        category: isRepresentation ? category : undefined,
        isLoading: false,
        ...(await this.getAssetJsonProps(assetJson, contents))
      })
    } catch (error) {
      this.setState({ error: error.message, isLoading: false })
    }
  }

  async getAssetJsonProps(assetJson: ItemAssetJson = {}, contents: Record<string, Blob> = {}): Promise<ItemAssetJson> {
    const { thumbnail, ...props } = assetJson

    // sanizite
    validatePath('thumbnail', assetJson, contents)
    validatePath('model', assetJson, contents)
    validateEnum('rarity', assetJson, Object.values(ItemRarity))
    validateEnum('category', assetJson, Object.values(WearableCategory))
    validateEnum('bodyShape', assetJson, Object.values(BodyShapeType))

    if (thumbnail && thumbnail in contents) {
      return {
        ...props,
        thumbnail: await blobToDataURL(contents[thumbnail])
      }
    }

    return props
  }

  handleDropRejected = async (rejectedFiles: File[]) => {
    console.warn('rejected', rejectedFiles)
    const error = new InvalidFilesError()
    this.setState({ error: error.message })
  }

  handleOpenDocs = () => window.open('https://docs.decentraland.org/3d-modeling/3d-models/', '_blank')

  handleNameChange = (_event: React.ChangeEvent<HTMLInputElement>, props: InputOnChangeData) =>
    this.setState({ name: props.value.slice(0, ITEM_NAME_MAX_LENGTH) })

  handleItemChange = (item: Item) => {
    this.setState({ item: item, category: item.data.category, rarity: item.rarity })
  }

  handleCategoryChange = (_event: React.SyntheticEvent<HTMLElement, Event>, { value }: DropdownProps) => {
    const category = value as WearableCategory
    if (this.state.category !== category) {
      if (this.state.type === ItemType.WEARABLE) {
        this.updateThumbnailByCategory(category)
      }
      this.setState({ category })
    }
  }

  handleRarityChange = (_event: React.SyntheticEvent<HTMLElement, Event>, { value }: DropdownProps) => {
    const rarity = value as ItemRarity
    this.setState({ rarity })
  }

  handlePlayModeChange = (_event: React.SyntheticEvent<HTMLElement, Event>, { value }: DropdownProps) => {
    const playMode = value as EmotePlayMode
    this.setState({ playMode })
  }

  handleOpenThumbnailDialog = () => {
    const { isEmotesFeatureFlagOn } = this.props
    const { type } = this.state
    if (isEmotesFeatureFlagOn && type === ItemType.EMOTE) {
      this.setState({ view: CreateItemView.THUMBNAIL })
    } else if (this.thumbnailInput.current) {
      this.thumbnailInput.current.click()
    }
  }

  handleThumbnailChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { contents } = this.state
    const { files } = event.target

    if (files && files.length > 0) {
      const file = files[0]
      const imageType = await getImageType(file)
      if (imageType !== ImageType.PNG) {
        this.setState({ error: t('create_single_item_modal.wrong_thumbnail_format') })
        return
      }
      this.setState({ error: undefined })

      const resizedFile = await resizeImage(file)
      const thumbnail = URL.createObjectURL(resizedFile)

      this.setState({
        thumbnail,
        contents: {
          ...contents,
          [THUMBNAIL_PATH]: file
        }
      })
    }
  }

  handleYes = () => this.setState({ isRepresentation: true })

  handleNo = () => this.setState({ isRepresentation: false })

  isAddingRepresentation = () => {
    const { metadata } = this.props
    return !!(metadata && metadata.item && !metadata.changeItemFile)
  }

  filterItemsByBodyShape = (item: Item) => {
    const { bodyShape } = this.state
    const { metadata } = this.props
    return getMissingBodyShapeType(item) === bodyShape && metadata.collectionId === item.collectionId
  }

  async processModel(
    model: string,
    contents: Record<string, Blob>
  ): Promise<[string, string, ModelMetrics, Record<string, Blob>, ItemType]> {
    let thumbnail: string = ''
    let metrics: ModelMetrics
    let type = ItemType.WEARABLE

    if (isImageFile(model)) {
      metrics = {
        triangles: 100,
        materials: 1,
        textures: 1,
        meshes: 1,
        bodies: 1,
        entities: 1
      }

      thumbnail = await convertImageIntoWearableThumbnail(
        contents[THUMBNAIL_PATH] || contents[model],
        this.state.category as WearableCategory
      )
    } else {
      const url = URL.createObjectURL(contents[model])
      const data = await getModelData(url, {
        width: 1024,
        height: 1024,
        extension: getExtension(model) || undefined,
        engine: EngineType.BABYLON
      })
      URL.revokeObjectURL(url)

      // for some reason the renderer reports 2x the amount of textures for wearble items
      data.info.textures = Math.round(data.info.textures / 2)

      thumbnail = data.image
      metrics = data.info
      type = data.type
    }

    return [thumbnail, model, metrics, contents, type]
  }

  /**
   * Updates the item's thumbnail if the user changes the category of the item.
   *
   * @param category - The category of the wearable.
   */
  async updateThumbnailByCategory(category: WearableCategory) {
    const { model, contents } = this.state

    const isCustom = !!contents && THUMBNAIL_PATH in contents
    if (!isCustom) {
      let thumbnail
      if (contents && isImageFile(model!)) {
        thumbnail = await convertImageIntoWearableThumbnail(contents[THUMBNAIL_PATH] || contents[model!], category)
      } else {
        const url = URL.createObjectURL(contents![model!])
        const { image } = await getModelData(url, {
          width: 1024,
          height: 1024,
          thumbnailType: getThumbnailType(category),
          extension: (model && getExtension(model)) || undefined,
          engine: EngineType.BABYLON
        })
        thumbnail = image
        URL.revokeObjectURL(url)
      }
      this.setState({ thumbnail })
    }
  }

  buildRepresentations(bodyShape: BodyShapeType, model: string, contents: SortedContent): WearableRepresentation[] {
    const representations: WearableRepresentation[] = []

    // add male representation
    if (bodyShape === BodyShapeType.MALE || bodyShape === BodyShapeType.BOTH) {
      representations.push({
        bodyShapes: [BodyShape.MALE],
        mainFile: this.prefixContentName(BodyShapeType.MALE, model),
        contents: Object.keys(contents.male),
        overrideHides: [],
        overrideReplaces: []
      })
    }

    // add female representation
    if (bodyShape === BodyShapeType.FEMALE || bodyShape === BodyShapeType.BOTH) {
      representations.push({
        bodyShapes: [BodyShape.FEMALE],
        mainFile: this.prefixContentName(BodyShapeType.FEMALE, model),
        contents: Object.keys(contents.female),
        overrideHides: [],
        overrideReplaces: []
      })
    }

    return representations
  }

  renderModalTitle = () => {
    const isAddingRepresentation = this.isAddingRepresentation()
    const { bodyShape, type, view } = this.state
    const { metadata } = this.props
    if (isAddingRepresentation) {
      return t('create_single_item_modal.add_representation', { bodyShape: t(`body_shapes.${bodyShape}`) })
    }

    if (metadata && metadata.changeItemFile) {
      return t('create_single_item_modal.change_item_file')
    }

    if (type === ItemType.EMOTE) {
      return t('create_single_item_modal.title_emote')
    }

    return view === CreateItemView.THUMBNAIL ? t('create_single_item_modal.thumbnail_step_title') : t('create_single_item_modal.title')
  }

  handleFileLoad = () => {
    const controller = WearablePreview.createController('thumbnail-picker')

    this.setState({ previewController: controller })

    controller?.scene.getScreenshot(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT).then(screenshot => {
      this.setState({ thumbnail: screenshot })
    })
  }

  // WearablePreview component to take the initial screenshot
  wearablePreviewComponent = (
    <WearablePreview
      id="thumbnail-picker"
      blob={this.state.file ? toWearableWithBlobs(this.state.file, true) : undefined}
      profile="default"
      disableBackground
      disableAutoRotate
      disableFace
      disableDefaultWearables
      skin="000000"
      wheelZoom={2}
      onLoad={this.handleFileLoad}
    />
  )

  renderImportView() {
    const { onClose, metadata } = this.props
    const { changeItemFile } = metadata as CreateSingleItemModalMetadata
    const { isRepresentation, category, error } = this.state
    const title = this.renderModalTitle()

    return (
      <>
        <ModalNavigation title={title} onClose={onClose} />
        <Modal.Content>
          <ItemImport
            error={error}
            acceptedExtensions={
              isRepresentation || changeItemFile
                ? isImageCategory(category! as WearableCategory)
                  ? IMAGE_EXTENSIONS
                  : MODEL_EXTENSIONS
                : ITEM_EXTENSIONS
            }
            onDropAccepted={this.handleDropAccepted}
            onDropRejected={this.handleDropRejected}
          />
          <div className="importer-thumbnail-container">{this.wearablePreviewComponent}</div>
        </Modal.Content>
      </>
    )
  }

  renderFields() {
    const { collection } = this.props
    const { name, category, rarity, contents, item, type } = this.state

    const belongsToAThirdPartyCollection = collection?.urn && isThirdParty(collection.urn)
    const rarities = getRarities()
    const categories: string[] = type === ItemType.WEARABLE ? getWearableCategories(contents) : getEmoteCategories()

    return (
      <>
        <Field className="name" label={t('create_single_item_modal.name_label')} value={name} onChange={this.handleNameChange} />
        {(!item || !item.isPublished) && !belongsToAThirdPartyCollection ? (
          <>
            <SelectField
              label={t('create_single_item_modal.rarity_label')}
              placeholder={t('create_single_item_modal.rarity_placeholder')}
              value={rarity}
              options={rarities.map(value => ({
                value,
                label: t(`wearable.supply`, {
                  count: getMaxSupplyForRarity(value),
                  formatted: getMaxSupplyForRarity(value).toLocaleString()
                }),
                text: t(`wearable.rarity.${value}`)
              }))}
              onChange={this.handleRarityChange}
            />
            <p className="rarity learn-more">
              <T
                id="create_single_item_modal.rarity_learn_more_about"
                values={{
                  learn_more: (
                    <a
                      href="https://docs.decentraland.org/decentraland/wearables-editor-user-guide/#rarity"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('global.learn_more')}
                    </a>
                  )
                }}
              />
            </p>
          </>
        ) : null}
        <SelectField
          required
          label={t('create_single_item_modal.category_label')}
          placeholder={t('create_single_item_modal.category_placeholder')}
          value={categories.includes(category!) ? category : undefined}
          options={categories.map(value => ({ value, text: t(`${type}.category.${value}`) }))}
          onChange={this.handleCategoryChange}
        />
      </>
    )
  }

  renderWearableDetails() {
    const { metadata } = this.props
    const { bodyShape, isRepresentation, item } = this.state
    const isAddingRepresentation = this.isAddingRepresentation()

    return (
      <>
        {isAddingRepresentation ? null : (
          <Section>
            <Header sub>{t('create_single_item_modal.representation_label')}</Header>
            <Row>
              {this.renderRepresentation(BodyShapeType.BOTH)}
              {this.renderRepresentation(BodyShapeType.MALE)}
              {this.renderRepresentation(BodyShapeType.FEMALE)}
            </Row>
          </Section>
        )}
        {bodyShape && (!metadata || !metadata.changeItemFile) ? (
          <>
            {bodyShape === BodyShapeType.BOTH ? (
              this.renderFields()
            ) : (
              <>
                {isAddingRepresentation ? null : (
                  <Section>
                    <Header sub>{t('create_single_item_modal.existing_item')}</Header>
                    <Row>
                      <div className={`option ${isRepresentation === true ? 'active' : ''}`} onClick={this.handleYes}>
                        {t('global.yes')}
                      </div>
                      <div className={`option ${isRepresentation === false ? 'active' : ''}`} onClick={this.handleNo}>
                        {t('global.no')}
                      </div>
                    </Row>
                  </Section>
                )}
                {isRepresentation === undefined ? null : isRepresentation ? (
                  <Section>
                    <Header sub>
                      {isAddingRepresentation
                        ? t('create_single_item_modal.adding_representation', { bodyShape: t(`body_shapes.${bodyShape}`) })
                        : t('create_single_item_modal.pick_item', { bodyShape: t(`body_shapes.${bodyShape}`) })}
                    </Header>
                    <ItemDropdown
                      value={item}
                      filter={this.filterItemsByBodyShape}
                      onChange={this.handleItemChange}
                      isDisabled={isAddingRepresentation}
                    />
                  </Section>
                ) : (
                  this.renderFields()
                )}
              </>
            )}
          </>
        ) : (
          this.renderFields()
        )}
      </>
    )
  }

  renderEmoteDetails() {
    const { playMode, type } = this.state
    const playModes: string[] = getEmotePlayModes()

    return (
      <>
        {this.renderFields()}
        <SelectField
          required
          label={t('create_single_item_modal.play_mode_label')}
          placeholder={t('create_single_item_modal.play_mode_placeholder')}
          value={playModes.includes(playMode!) ? playMode : undefined}
          options={playModes.map(value => ({ value, text: t(`${type}.play_mode.${value}`) }))}
          onChange={this.handlePlayModeChange}
        />
        <div className="dcl select-field">
          <Message info visible content={t('create_single_item_modal.emote_notice')} icon={<Icon name="alert" className="" />} />
        </div>
      </>
    )
  }

  renderMetrics() {
    const { metrics, type } = this.state

    if (metrics) {
      if (type === ItemType.WEARABLE) {
        return (
          <div className="metrics">
            <div className="metric triangles">{t('model_metrics.triangles', { count: metrics.triangles })}</div>
            <div className="metric materials">{t('model_metrics.materials', { count: metrics.materials })}</div>
            <div className="metric textures">{t('model_metrics.textures', { count: metrics.textures })}</div>
          </div>
        )
      } else {
        return (
          <div className="metrics">
            <div className="metric materials">{t('model_metrics.sequences', { count: (metrics as ModelEmoteMetrics).sequences })}</div>
            <div className="metric materials">
              {t('model_metrics.duration', { count: (metrics as ModelEmoteMetrics).duration.toFixed(2) })}
            </div>
            <div className="metric materials">{t('model_metrics.frames', { count: (metrics as ModelEmoteMetrics).frames })}</div>
            <div className="metric materials">{t('model_metrics.fps', { count: (metrics as ModelEmoteMetrics).fps.toFixed(2) })}</div>
          </div>
        )
      }
    } else {
      return null
    }
  }

  isDisabled(): boolean {
    const { isLoading } = this.props

    return !this.isValid() || isLoading
  }

  isValid(): boolean {
    const { name, thumbnail, metrics, bodyShape, category, playMode, rarity, item, isRepresentation, type } = this.state
    const { collection } = this.props
    const belongsToAThirdPartyCollection = collection?.urn && isThirdParty(collection.urn)

    let required: (string | ModelMetrics | Item | undefined)[]

    if (isRepresentation) {
      required = [item]
    } else if (belongsToAThirdPartyCollection) {
      required = [name, thumbnail, metrics, bodyShape, category]
    } else if (type === ItemType.EMOTE) {
      required = [name, thumbnail, metrics, category, playMode, rarity, type]
    } else {
      required = [name, thumbnail, metrics, bodyShape, category, rarity, type]
    }

    return required.every(prop => prop !== undefined)
  }

  renderDetailsView() {
    const { onClose, metadata, error, isLoading } = this.props
    const { thumbnail, isRepresentation, rarity, error: stateError, type } = this.state

    const isDisabled = this.isDisabled()
    const thumbnailStyle = getBackgroundStyle(rarity)
    const title = this.renderModalTitle()

    return (
      <>
        <ModalNavigation title={title} onClose={onClose} />
        <Modal.Content>
          <Form onSubmit={this.handleSubmit} disabled={isDisabled}>
            <Column>
              <Row className="details">
                <Column className="preview" width={192} grow={false}>
                  <div className="thumbnail-container">
                    <img className="thumbnail" src={thumbnail || undefined} style={thumbnailStyle} alt={title} />
                    {isRepresentation ? null : (
                      <>
                        <Icon name="camera" onClick={this.handleOpenThumbnailDialog} />
                        <input type="file" ref={this.thumbnailInput} onChange={this.handleThumbnailChange} accept="image/png" />
                      </>
                    )}
                  </div>
                  {this.renderMetrics()}
                </Column>
                <Column className="data" grow={true}>
                  {type === ItemType.WEARABLE ? this.renderWearableDetails() : this.renderEmoteDetails()}
                </Column>
              </Row>
              <Row className="actions" align="right">
                <Button primary disabled={isDisabled} loading={isLoading}>
                  {(metadata && metadata.changeItemFile) || isRepresentation ? t('global.save') : t('global.create')}
                </Button>
              </Row>
              {stateError ? (
                <Row className="error" align="right">
                  <p className="danger-text">{stateError}</p>
                </Row>
              ) : null}
              {error ? (
                <Row className="error" align="right">
                  <p className="danger-text">{error}</p>
                </Row>
              ) : null}
            </Column>
          </Form>
        </Modal.Content>
      </>
    )
  }

  handleOnScreenshotTaken = (screenshot: string) => {
    this.setState({ thumbnail: screenshot, isLoading: true }, () => this.setState({ view: CreateItemView.DETAILS }))
  }

  renderThumbnailView() {
    const { onClose } = this.props
    const { file, isLoading } = this.state
    return (
      <EditThumbnailStep
        isLoading={!!isLoading}
        blob={file ? toWearableWithBlobs(file, true) : undefined}
        title={this.renderModalTitle()}
        onBack={() => this.setState({ view: CreateItemView.DETAILS })}
        onSave={this.handleOnScreenshotTaken}
        onClose={onClose}
      />
    )
  }

  renderRepresentation(type: BodyShapeType) {
    const { bodyShape } = this.state
    const { metadata } = this.props
    return (
      <div
        className={`option has-icon ${type} ${type === bodyShape ? 'active' : ''}`.trim()}
        onClick={() =>
          this.setState({ bodyShape: type, isRepresentation: metadata && metadata.changeItemFile ? false : undefined, item: undefined })
        }
      >
        {t('body_shapes.' + type)}
      </div>
    )
  }

  renderSetPrice() {
    const { onClose } = this.props
    const { item, itemSortedContents } = this.state
    return (
      <EditPriceAndBeneficiaryModal
        name={'EditPriceAndBeneficiaryModal'}
        metadata={{ itemId: item!.id }}
        item={item!}
        itemSortedContents={itemSortedContents}
        onClose={onClose}
        // If the Set Price step is skipped, the item must be saved
        onSkip={this.handleSubmit}
      />
    )
  }

  renderView() {
    switch (this.state.view) {
      case CreateItemView.IMPORT:
        return this.renderImportView()
      case CreateItemView.DETAILS:
        return this.renderDetailsView()
      case CreateItemView.THUMBNAIL:
        return this.renderThumbnailView()
      case CreateItemView.SET_PRICE:
        return this.renderSetPrice()
      default:
        return null
    }
  }

  render() {
    const { name, onClose } = this.props
    return (
      <Modal name={name} onClose={onClose}>
        {this.renderView()}
      </Modal>
    )
  }
}
