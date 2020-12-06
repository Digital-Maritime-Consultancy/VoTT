import _ from "lodash";
import React, { RefObject } from "react";
import { connect } from "react-redux";
import { RouteComponentProps } from "react-router-dom";
import SplitPane from "react-split-pane";
import { bindActionCreators } from "redux";
import { SelectionMode } from "vott-ct/lib/js/CanvasTools/Interface/ISelectorSettings";
import HtmlFileReader from "../../../../../common/htmlFileReader";
import {addLocValues, strings} from "../../../../../common/strings";
import {
    AssetState, AssetType, EditorMode, IApplicationState,
    IAppSettings, IAsset, IAssetMetadata, IProject, IRegion,
    ISize, ITag, IAdditionalPageSettings, AppError, ErrorCode, EditorContext,
} from "../../../../../models/applicationState";
import { IToolbarItemRegistration, ToolbarItemFactory } from "../../../../../providers/toolbar/toolbarItemFactory";
import IApplicationActions, * as applicationActions from "../../../../../redux/actions/applicationActions";
import IProjectActions, * as projectActions from "../../../../../redux/actions/projectActions";
import { ToolbarItemName } from "../../../../../registerToolbar";
import { AssetService } from "../../../../../services/assetService";
import { AssetPreview } from "../../../common/assetPreview/assetPreview";
import { KeyboardBinding } from "../../../common/keyboardBinding/keyboardBinding";
import { KeyEventType } from "../../../common/keyboardManager/keyboardManager";
import { TagInput } from "../../../common/tagInput/tagInput";
import { ToolbarItem } from "../../../toolbar/toolbarItem";
import Canvas from "../canvas";
import CanvasHelpers from "../canvasHelpers";
import "../editorPage.scss";
import EditorSideBar from "../editorSideBar";
import { EditorToolbar } from "../editorToolbar";
import Alert from "../../../common/alert/alert";
import Confirm from "../../../common/confirm/confirm";
import { ActiveLearningService } from "../../../../../services/activeLearningService";
import { toast } from "react-toastify";
import Form, { IChangeEvent } from "react-jsonschema-form";
import CustomFieldTemplate from "../../../common/customField/customFieldTemplate";
import Preview from "./preview";
import { IEditorPageProps, IEditorPageState, mapStateToProps, mapDispatchToProps, SegmentSelectionMode } from '../editorPage';

/**
 * Properties for Editor Page
 * @member project - Project being edited
 * @member recentProjects - Array of projects recently viewed/edited
 * @member actions - Project actions
 * @member applicationActions - Application setting actions
 */

/**
 * @name - Editor Page
 * @description - Page for adding/editing/removing tags to assets
 */

// tslint:disable-next-line:no-var-requires
const formSchema = addLocValues(require("./imageAnnotationForm.json"));
// tslint:disable-next-line:no-var-requires
const uiSchema = addLocValues(require("./imageAnnotationForm.ui.json"));

const defaultFormData = {
    id: "",
    file_name: "",
    frame_number: 0,
    date_captured: "",
    source_video_id: 0,
    included_classes_list: [],
    labeling_object_list: [],
    port: "",
    latitude: "",
    longitude: "",
    season: "winter",
    weather: "sunny",
    wave_height: 0,
    wind_speed: 0,
    visible_distance: 0,
    width: 0,
    height: 0,
    date_created: "",
    date_updated: "",
    license: 1,
}

export interface IEditorMetadataPageState {
    /** Array of assets in project */
    assets: IAsset[];
    /** The selected asset for the primary editing experience */
    selectedAsset?: IAssetMetadata;
    /** The child assets used for nest asset typs */
    childAssets?: IAsset[];
    /** Additional settings for asset previews */
    additionalSettings?: IAdditionalPageSettings;
    /** Size of the asset thumbnails to display in the side bar */
    thumbnailSize: ISize;
    /** Editing context */
    context: EditorContext;
    /**
     * Whether or not the editor is in a valid state
     * State is invalid when a region has not been tagged
     */
    isValid: boolean;
    formData: object;
}

@connect(mapStateToProps, mapDispatchToProps)
export default class EditorMetadataPage extends React.Component<IEditorPageProps, IEditorMetadataPageState> {
    public state: IEditorMetadataPageState = {
        assets: [],
        childAssets: [],
        additionalSettings: {
            videoSettings: (this.props.project) ? this.props.project.videoSettings : null,
            activeLearningSettings: (this.props.project) ? this.props.project.activeLearningSettings : null,
        },
        thumbnailSize: this.props.appSettings.thumbnailSize || { width: 220, height: 165 },
        isValid: true,
        context: EditorContext.Metadata,
        formData: undefined,
    };

    private loadingProjectAssets: boolean = false;
    private canvas: RefObject<Preview> = React.createRef();

    public async componentDidMount() {
        const projectId = this.props.match.params["projectId"];
        if (this.props.project) {
            await this.loadProjectAssets();
        } else if (projectId) {
            const project = this.props.recentProjects.find((project) => project.id === projectId);
            await this.props.actions.loadProject(project);
        }
    }

    public async componentDidUpdate(prevProps: Readonly<IEditorPageProps>) {
        if (this.props.project && this.state.assets.length === 0) {
            await this.loadProjectAssets();
        }

        // Navigating directly to the page via URL (ie, http://vott/projects/a1b2c3dEf/edit) sets the default state
        // before props has been set, this updates the project and additional settings to be valid once props are
        // retrieved.
        if (this.props.project && !prevProps.project) {
            this.setState({
                additionalSettings: {
                    videoSettings: (this.props.project) ? this.props.project.videoSettings : null,
                    activeLearningSettings: (this.props.project) ? this.props.project.activeLearningSettings : null,
                },
            });
        }

        if (this.props.project && prevProps.project && this.props.project.tags !== prevProps.project.tags) {
            this.updateRootAssets();
        }

    }

    public render() {
        const { project } = this.props;
        const { assets, selectedAsset } = this.state;
        const rootAssets = assets.filter((asset) => !asset.parent);

        if (!project) {
            return (<div>Loading...</div>);
        }

        return (
            <div className="editor-page">
                <SplitPane split="vertical"
                    defaultSize={this.state.thumbnailSize.width}
                    minSize={100}
                    maxSize={400}
                    paneStyle={{ display: "flex" }}
                    onChange={this.onSideBarResize}
                    onDragFinished={this.onSideBarResizeComplete}>
                    <div className="editor-page-sidebar bg-lighter-1">
                        <EditorSideBar
                            assets={rootAssets}
                            selectedAsset={selectedAsset ? selectedAsset.asset : null}
                            editorContext={this.state.context}
                            onBeforeAssetSelected={this.onBeforeAssetSelected}
                            onAssetSelected={this.selectAsset}
                            thumbnailSize={this.state.thumbnailSize}
                        />
                    </div>
                    <div className="editor-page-content">
                        <div className="editor-page-content-main">
                            <div className="editor-page-content-main-body" style={{ overflowY: "scroll" }}>
                                {selectedAsset && this.state.formData &&
                                    <Form className="editor-page-content-main-body-metadata" schema={formSchema} uiSchema={uiSchema} formData={this.state.formData} onChange={this.onFormChange} onSubmit={() => alert("submitted")}/>}
                            </div>
                        </div>
                    </div>
                </SplitPane>
            </div>
        );
    }

    private onFormChange = (changeEvent: IChangeEvent<IEditorPageProps>) => {
        console.log(changeEvent);
    }

    private convertAssetMetadata2FormData = (selectedAsset: IAssetMetadata) => {
        if (selectedAsset){
            const timestring = this.getTimestampNow();
            return {
                ... defaultFormData,
                id: selectedAsset.asset.id,
                file_name: selectedAsset.asset.name,
                included_classes_list: selectedAsset.segments.map( (s) => s.tag ),
                labeling_object_list: Array.from(new Set(selectedAsset.regions.map( (r) => r.tag ))),
                width: selectedAsset.asset.size.width,
                height: selectedAsset.asset.size.height,
                date_created: timestring,
                date_updated: timestring,
            }
        }
        else{
            return defaultFormData;
        }
    }

    private getTimestampNow = () => {
        const timestampInSeconds = Math.floor(Date.now()/1000);
        const date = new Date(timestampInSeconds*1000);
        return date.toISOString().split("T").join(" ");
    }
    
    /**
     * Called when the asset side bar is resized
     * @param newWidth The new sidebar width
     */
    private onSideBarResize = (newWidth: number) => {
        this.setState({
            thumbnailSize: {
                width: newWidth,
                height: newWidth / (4 / 3),
            },
        }, () => this.canvas.current.forceResize());
    }

    /**
     * Called when the asset sidebar has been completed
     */
    private onSideBarResizeComplete = () => {
        const appSettings = {
            ...this.props.appSettings,
            thumbnailSize: this.state.thumbnailSize,
        };

        this.props.applicationActions.saveAppSettings(appSettings);
    }

    /**
     * Raised when a child asset is selected on the Asset Preview
     * ex) When a video is paused/seeked to on a video
     */
    private onChildAssetSelected = async (childAsset: IAsset) => {
        if (this.state.selectedAsset && this.state.selectedAsset.asset.id !== childAsset.id) {
            await this.selectAsset(childAsset);
        }
    }

    /**
     * Returns a value indicating whether the current asset is taggable
     */
    private isTaggableAssetType = (asset: IAsset): boolean => {
        return asset.type !== AssetType.Unknown && asset.type !== AssetType.Video;
    }

    /**
     * Raised when the selected asset has been changed.
     * This can either be a parent or child asset
     */
    private onAssetMetadataChanged = async (assetMetadata: IAssetMetadata): Promise<void> => {
        if (assetMetadata) {
            this.setState( {... this.state, formData: this.convertAssetMetadata2FormData(assetMetadata)});
        };
    }

    /**
     * Navigates to the previous / next root asset on the sidebar
     * @param direction Number specifying asset navigation
     */
    private goToRootAsset = async (direction: number) => {
        const selectedRootAsset = this.state.selectedAsset.asset.parent || this.state.selectedAsset.asset;
        const currentIndex = this.state.assets
            .findIndex((asset) => asset.id === selectedRootAsset.id);

        if (direction > 0) {
            await this.selectAsset(this.state.assets[Math.min(this.state.assets.length - 1, currentIndex + 1)]);
        } else {
            await this.selectAsset(this.state.assets[Math.max(0, currentIndex - 1)]);
        }
    }

    private onBeforeAssetSelected = (): boolean => {
        return this.state.isValid;
    }

    private selectAsset = async (asset: IAsset): Promise<void> => {
        // Nothing to do if we are already on the same asset.
        if (this.state.selectedAsset && this.state.selectedAsset.asset.id === asset.id) {
            return;
        }

        if (!this.state.isValid) {
            return;
        }

        const assetMetadata = await this.props.actions.loadAssetMetadata(this.props.project, asset);

        try {
            if (!assetMetadata.asset.size) {
                const assetProps = await HtmlFileReader.readAssetAttributes(asset);
                assetMetadata.asset.size = { width: assetProps.width, height: assetProps.height };
            }
        } catch (err) {
            console.warn("Error computing asset size");
        }

        this.setState({
            selectedAsset: assetMetadata,
        }, async () => {
            await this.onAssetMetadataChanged(assetMetadata);
        });
    }

    private loadProjectAssets = async (): Promise<void> => {
        if (this.loadingProjectAssets || this.state.assets.length > 0) {
            return;
        }

        this.loadingProjectAssets = true;

        // Get all root project assets
        const rootProjectAssets = _.values(this.props.project.assets)
            .filter((asset) => !asset.parent);

        // Get all root assets from source asset provider
        const sourceAssets = await this.props.actions.loadAssets(this.props.project);

        // Merge and uniquify
        const rootAssets = _(rootProjectAssets)
            .concat(sourceAssets)
            .uniqBy((asset) => asset.id)
            .value();

        const lastVisited = rootAssets.find((asset) => asset.id === this.props.project.lastVisitedAssetId);

        this.setState({
            assets: rootAssets,
        }, async () => {
            if (rootAssets.length > 0) {
                await this.selectAsset(lastVisited ? lastVisited : rootAssets[0]);
            }
            this.loadingProjectAssets = false;
        });
    }

    /**
     * Updates the root asset list from the project assets
     */
    private updateRootAssets = () => {
        const updatedAssets = [...this.state.assets];
        updatedAssets.forEach((asset) => {
            const projectAsset = this.props.project.assets[asset.id];
            if (projectAsset) {
                asset.state = projectAsset.state;
            }
        });

        this.setState({ assets: updatedAssets });
    }
}
