import {
    Entity, EntityOnDeleteProps,
    EntityReference,
    EntitySchema,
    EntityValues,
    GeoPoint
} from "../entities";
import { FilterValues, WhereFilterOp } from "../collections";
import { Properties, Property } from "../properties";
import {
    computeSchemaProperties,
    sanitizeData,
    traverseValues,
    updateAutoValues
} from "../utils";
import deepEqual from "deep-equal";
import {
    DataSource,
    DeleteEntityProps,
    FetchCollectionProps,
    FetchEntityProps,
    ListenCollectionProps,
    ListenEntityProps,
    SaveEntityProps
} from "../datasource";
import {
    collection,
    deleteDoc,
    doc,
    DocumentReference,
    DocumentSnapshot,
    getDoc,
    getDocs,
    getFirestore,
    limit as limitClause,
    onSnapshot,
    orderBy as orderByClause,
    Query,
    query,
    serverTimestamp,
    setDoc,
    startAfter as startAfterClause,
    Timestamp,
    where as whereClause
} from "firebase/firestore";
import { FirebaseApp } from "firebase/app";

export function useFirestoreDataSource (firebaseApp: FirebaseApp):DataSource {

    const db = getFirestore(firebaseApp);

    /**
     *
     * @param doc
     * @param schema
     * @param path
     * @category Firestore
     */
    function createEntityFromSchema<M extends { [Key: string]: any }>
    (
        doc: DocumentSnapshot,
        schema: EntitySchema<M>,
        path: string
    ): Entity<M> {

        const data = doc.data() ?
            sanitizeData(firestoreToCMSModel(doc.data(), schema, path) as EntityValues<M>, schema, path)
            : undefined;
        return {
            id: doc.id,
            path: getCMSPathFromFirestorePath(doc.ref.path),
            values: data
        };
    }

    /**
     * Remove id from Firestore path
     * @param fsPath
     */
    function getCMSPathFromFirestorePath(fsPath: string): string {
        let to = fsPath.lastIndexOf("/");
        to = to == -1 ? fsPath.length : to;
        return fsPath.substring(0, to);
    }

    /**
     * Recursive function that converts Firestore data types into CMS or plain
     * JS types.
     * FireCMS uses Javascript dates internally instead of Firestore timestamps.
     * This makes it easier to interact with the rest of the libraries and
     * bindings.
     * Also, Firestore references are replaced with {@link EntityReference}
     * @param data
     * @param schema
     * @param path
     * @category Firestore
     */
    function firestoreToCMSModel(data: any, schema: EntitySchema<any>, path: string): any {
        return traverseValues(data,
            computeSchemaProperties(schema, path),
            (value, property) => {
                if (value === null)
                    return null;

                if (deepEqual(value, serverTimestamp())) {
                    return null;
                }

                if (value instanceof Timestamp && property.dataType === "timestamp") {
                    return value.toDate();
                }

                if (value instanceof GeoPoint && property.dataType === "geopoint") {
                    return new GeoPoint(value.latitude, value.longitude);
                }

                if (value instanceof DocumentReference && property.dataType === "reference") {
                    return new EntityReference(value.id, getCMSPathFromFirestorePath(value.path));
                }

                return value;
            });
    }

    function buildQuery<M>(path: string, filter: FilterValues<M> | undefined, orderBy: string | undefined, order: "desc" | "asc" | undefined, startAfter: any[] | undefined, limit: number | undefined) {

        const collectionReference: Query = collection(db, path);

        const queryParams = [];
        if (filter) {
            Object.entries(filter)
                .filter(([_, entry]) => !!entry)
                .forEach(([key, filterParameter]) => {
                    const [op, value] = filterParameter as [WhereFilterOp, any];
                    queryParams.push(whereClause(key, op, value));
                });
        }

        if (filter && orderBy && order) {
            Object.entries(filter).forEach(([key, value]) => {
                if (key !== orderBy) {
                    queryParams.push(orderByClause(key, "asc"));
                }
            });
        }

        if (orderBy && order) {
            queryParams.push(orderByClause(orderBy, order));
        }

        if (startAfter) {
            queryParams.push(startAfterClause(startAfter));
        }

        if (limit) {
            queryParams.push(limitClause(limit));
        }

        return query(collectionReference, ...queryParams);
    }

    const datasource:DataSource ={

        /**
         * Fetch entities in a Firestore path
         * @param path
         * @param schema
         * @param filter
         * @param limit
         * @param startAfter
         * @param orderBy
         * @param order
         * @return Function to cancel subscription
         * @see useCollectionFetch if you need this functionality implemented as a hook
         * @category Firestore
         */
        fetchCollection<M extends { [Key: string]: any }>({
                                                              path,
                                                              schema,
                                                              filter,
                                                              limit,
                                                              startAfter,
                                                              orderBy,
                                                              order
                                                          }: FetchCollectionProps<M>
        ): Promise<Entity<M>[]> {

            console.debug("Fetching collection", path, limit, filter, startAfter, orderBy, order);
            const query = buildQuery(path, filter, orderBy, order, startAfter, limit);
            return getDocs(query)
                .then((snapshot) =>
                    snapshot.docs.map((doc) => createEntityFromSchema(doc, schema, path)));
        },


        /**
         * Listen to a entities in a given path
         * @param path
         * @param schema
         * @param onSnapshot
         * @param onError
         * @param filter
         * @param limit
         * @param startAfter
         * @param orderBy
         * @param order
         * @return Function to cancel subscription
         * @see useCollectionFetch if you need this functionality implemented as a hook
         * @category Firestore
         */
        listenCollection<M extends { [Key: string]: any }>(
            {
                path,
                schema,
                filter,
                limit,
                startAfter,
                orderBy,
                order,
                onUpdate,
                onError
            }: ListenCollectionProps<M>
        ): () => void {

            console.debug("Listening collection", path, limit, filter, startAfter, orderBy, order);

            const query = buildQuery(path, filter, orderBy, order, startAfter, limit);

            return onSnapshot(query,
                (colSnapshot) =>
                    onUpdate(colSnapshot.docs.map((doc) => createEntityFromSchema(doc, schema, path))),
                onError
            );
        },


        /**
         * Retrieve an entity given a path and a schema
         * @param path
         * @param entityId
         * @param schema
         * @category Firestore
         */
        fetchEntity<M extends { [Key: string]: any }>({
                                                          path,
                                                          entityId,
                                                          schema
                                                      }: FetchEntityProps<M>
        ): Promise<Entity<M>> {
            console.debug("Fetch entity", path, entityId);
            return getDoc(doc(db, path, entityId))
                .then((docSnapshot) => createEntityFromSchema(docSnapshot, schema, path));

        },

        /**
         *
         * @param path
         * @param entityId
         * @param schema
         * @param onUpdate
         * @param onError
         * @return Function to cancel subscription
         * @category Firestore
         */
        listenEntity<M extends { [Key: string]: any }>(
            {
                path,
                entityId,
                schema,
                onUpdate,
                onError
            }: ListenEntityProps<M>): () => void {
            console.debug("Listening entity", path, entityId);
            return onSnapshot(
                doc(db, path, entityId),
                (docSnapshot) => onUpdate(createEntityFromSchema(docSnapshot, schema, path)),
                onError
            );
        },


        /**
         * Save entity to the specified path. Note that Firestore does not allow
         * undefined values.
         * @param path
         * @param id
         * @param data
         * @param schema
         * @param status
         * @param onSaveSuccess
         * @param onSaveFailure
         * @param onPreSaveHookError
         * @param onSaveSuccessHookError
         * @category Firestore
         */
        async saveEntity<M extends { [Key: string]: any }>(
            {
                path,
                entityId,
                values,
                schema,
                status,
                onSaveSuccess,
                onSaveFailure,
                onPreSaveHookError,
                onSaveSuccessHookError,
                context
            }: SaveEntityProps<M>): Promise<void> {

            const properties: Properties<M> = computeSchemaProperties(schema, path, entityId);
            let updatedValues: EntityValues<M> = updateAutoValues(
                {
                    inputValues: values,
                    properties,
                    status,
                    timestampNowValue: serverTimestamp(),
                    referenceConverter: (value: EntityReference) => doc(db, value.path, value.id),
                    geopointConverter: (value: GeoPoint) => new GeoPoint(value.latitude, value.longitude)
                });

            if (schema.onPreSave) {
                try {
                    updatedValues = await schema.onPreSave({
                        schema,
                        path,
                        entityId,
                        values: updatedValues,
                        status,
                        context
                    });
                } catch (e) {
                    console.error(e);
                    if (onPreSaveHookError)
                        onPreSaveHookError(e);
                    return;
                }
            }

            console.debug("Saving entity", path, entityId, updatedValues);

            let documentReference: DocumentReference;
            if (entityId)
                documentReference = doc(db, path, entityId);
            else
                documentReference = doc(db, path);

            const entity: Entity<M> = {
                id: documentReference.id,
                path: documentReference.path,
                values: updatedValues
            };

            return setDoc(documentReference, updatedValues, { merge: true })
                .then(() => {
                    try {
                        if (schema.onSaveSuccess) {
                            schema.onSaveSuccess({
                                schema,
                                path,
                                entityId,
                                values: updatedValues,
                                status,
                                context
                            });
                        }
                    } catch (e) {
                        if (onSaveSuccessHookError)
                            onSaveSuccessHookError(e);
                    }
                    onSaveSuccess && onSaveSuccess(entity);
                })
                .catch((e) => {
                    if (schema.onSaveFailure) {
                        schema.onSaveFailure({
                            schema,
                            path,
                            entityId,
                            values: updatedValues,
                            status,
                            context
                        });
                    }
                    if (onSaveFailure) onSaveFailure(e);
                });
        },

        /**
         * Delete an entity
         * @param entity
         * @param schema
         * @param path
         * @param onDeleteSuccess
         * @param onDeleteFailure
         * @param onPreDeleteHookError
         * @param onDeleteSuccessHookError
         * @param context
         * @return was the whole deletion flow successful
         * @category Firestore
         */
        async deleteEntity<M extends { [Key: string]: any }>(
            {
                entity,
                schema,
                onDeleteSuccess,
                onDeleteFailure,
                onPreDeleteHookError,
                onDeleteSuccessHookError,
                context
            }: DeleteEntityProps<M>
        ): Promise<boolean> {

            console.debug("Deleting entity", entity.path, entity.id);

            const entityDeleteProps:EntityOnDeleteProps<M> = {
                entity,
                schema,
                entityId: entity.id,
                path: entity.path,
                context
            };

            if (schema.onPreDelete) {
                try {
                    await schema.onPreDelete(entityDeleteProps);
                } catch (e) {
                    console.error(e);
                    if (onPreDeleteHookError)
                        onPreDeleteHookError(entity, e);
                    return false;
                }
            }

            return deleteDoc(doc(db, entity.path, entity.id))
                .then(() => {
                    onDeleteSuccess && onDeleteSuccess(entity);
                    try {
                        if (schema.onDelete) {
                            schema.onDelete(entityDeleteProps);
                        }
                        return true;
                    } catch (e) {
                        if (onDeleteSuccessHookError)
                            onDeleteSuccessHookError(entity, e);
                        return false;
                    }
                }).catch((e) => {
                    if (onDeleteFailure) onDeleteFailure(entity, e);
                    return false;
                });

        },

        /**
         * Check if the given property is unique in the given collection
         * @param path Collection path
         * @param name of the property
         * @param value
         * @param property
         * @param entityId
         * @return `true` if there are no other fields besides the given entity
         * @category Firestore
         */
        checkUniqueField(
            path: string,
            name: string,
            value: any,
            property: Property,
            entityId?: string
        ): Promise<boolean> {
            console.debug("Check unique field entity", path, name, value, entityId);

            if (property.dataType === "array") {
                console.error("checkUniqueField received an array");
            }

            if (value === undefined || value === null) {
                return Promise.resolve(true);
            }
            const q = query(collection(db, path), whereClause(name, "==", value));
            return getDocs(q)
                .then((snapshots) =>
                    snapshots.docs.filter(doc => doc.id !== entityId).length === 0
                );

        }
    };

    return datasource;

}