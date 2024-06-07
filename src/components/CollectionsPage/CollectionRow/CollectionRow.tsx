import { useCallback } from 'react'
import { useHistory } from 'react-router-dom'
import { Table, Icon } from 'decentraland-ui'
import { t } from 'decentraland-dapps/dist/modules/translation/utils'
import { locations } from 'routing/locations'
import { getCollectionType } from 'modules/collection/utils'
import CollectionStatus from 'components/CollectionStatus'
import CollectionImage from 'components/CollectionImage'
import { formatDistanceToNow } from 'lib/date'
import { Props } from './CollectionRow.types'
import styles from './CollectionRow.module.css'

export default function CollectionRow(props: Props) {
  const { collection, itemCount } = props
  const history = useHistory()

  const handleTableRowClick = useCallback(() => {
    history.push(locations.collectionDetail(collection.id, getCollectionType(collection)))
  }, [history])

  const type = getCollectionType(collection)

  return (
    <Table.Row className={styles.CollectionRow} onClick={handleTableRowClick}>
      <Table.Cell width={3}>
        <div className={styles.imageColumn}>
          <CollectionImage className={styles.image} collectionId={collection.id} />
          <div className={styles.title}>
            <CollectionStatus collection={collection} />
            <div className={styles.name}>{collection.name}</div>
          </div>
        </div>
      </Table.Cell>
      <Table.Cell width={3}>{t(`collection.type.${type}`)}</Table.Cell>
      <Table.Cell width={2}>{itemCount}</Table.Cell>
      <Table.Cell width={3}>{formatDistanceToNow(collection.createdAt, { addSuffix: true })}</Table.Cell>
      <Table.Cell width={3}>{formatDistanceToNow(collection.updatedAt, { addSuffix: true })}</Table.Cell>
      <Table.Cell width={3}>
        {collection.isPublished ? (
          <div className={styles.published}>
            {t('global.published')} <Icon name="check" />
          </div>
        ) : null}
      </Table.Cell>
    </Table.Row>
  )
}
