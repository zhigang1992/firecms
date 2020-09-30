import React from "react";
import CollectionTable from "../collection/CollectionTable";
import { RouteComponentProps } from "react-router";
import { Entity, EntityCollectionView, EntitySchema } from "../models";
import {
    BreadcrumbEntry,
    getEntityPath,
    getRouterNewEntityPath,
    replacePathIdentifiers
} from "./navigation";
import { Box, Button } from "@material-ui/core";
import { Link as ReactLink } from "react-router-dom";
import DeleteEntityDialog from "../collection/DeleteEntityDialog";
import AddIcon from "@material-ui/icons/Add";
import { useSelectedEntityContext } from "../selected_entity_controller";
import { useBreadcrumbsContext } from "../breadcrumbs_controller";

interface CollectionRouteProps<S extends EntitySchema> {
    view: EntityCollectionView<S>;
    entityPlaceholderPath: string,
    breadcrumbs: BreadcrumbEntry[]
}

export function CollectionRoute<S extends EntitySchema>({
                                                            view,
                                                            entityPlaceholderPath,
                                                            breadcrumbs,
                                                            match,
                                                            history
                                                        }
                                                            : CollectionRouteProps<S> & RouteComponentProps) {
    let collectionPath: string;

    if (match) {
        collectionPath = replacePathIdentifiers(match.params, entityPlaceholderPath);
    } else {
        throw Error("No match prop for some reason");
    }

    const breadcrumbsContext = useBreadcrumbsContext();
    breadcrumbsContext.set({
        breadcrumbs: breadcrumbs,
        currentTitle: view.schema.name,
        pathParams: match.params
    });

    const selectedEntityContext = useSelectedEntityContext();

    const [deleteEntityClicked, setDeleteEntityClicked] = React.useState<Entity<S> | undefined>(undefined);

    function onEntityEdit(collectionPath: string, entity: Entity<S>) {
        const entityPath = getEntityPath(entity.id, collectionPath);
        history.push(entityPath);
    }

    const onEntityClick = (collectionPath: string, entity: Entity<S>) => {
        selectedEntityContext.open({
            entity,
            schema: view.schema,
            subcollections: view.subcollections
        });
    };

    const onEntityDelete = (collectionPath: string, entity: Entity<S>) => {
        setDeleteEntityClicked(entity);
    };

    const deleteEnabled = view.deleteEnabled === undefined || view.deleteEnabled;
    return (
        <React.Fragment>

            <Box mb={3}>
                <Box textAlign="right">
                    <Button
                        component={ReactLink}
                        startIcon={<AddIcon/>}
                        to={getRouterNewEntityPath(collectionPath)}
                        size="large"
                        variant="contained"
                        color="primary"
                    >
                        Add {view.schema.name}
                    </Button>
                </Box>
            </Box>

            <CollectionTable collectionPath={view.relativePath}
                             schema={view.schema}
                             textSearchDelegate={view.textSearchDelegate}
                             includeToolbar={true}
                             onEntityEdit={onEntityEdit}
                             onEntityClick={onEntityClick}
                             onEntityDelete={deleteEnabled ? onEntityDelete : undefined}
                             additionalColumns={view.additionalColumns}
                             small={view.small === undefined ? false : view.small}
                             paginationEnabled={view.pagination === undefined ? true : view.pagination}
                             initialFilter={view.initialFilter}
                             filterableProperties={view.filterableProperties}
                             properties={view.properties}/>

            {deleteEntityClicked &&
            <DeleteEntityDialog entity={deleteEntityClicked}
                                schema={view.schema}
                                open={!!deleteEntityClicked}
                                afterDelete={() => view?.onEntityDelete ? view.onEntityDelete(collectionPath, deleteEntityClicked) : undefined}
                                onClose={() => setDeleteEntityClicked(undefined)}/>}

        </React.Fragment>
    );
}
