import React, { Fragment, ReactElement } from "react";
import {
    EditorContext,
    EditorMode, IAssetMetadata,
    IBoundingBox,
    IProject,
    ISegment,
    ISegmentOffset,
} from "../../../../../models/applicationState";
import * as shortid from "shortid";
import { AssetPreview, ContentSource } from "../../../common/assetPreview/assetPreview";
import Confirm from "../../../common/confirm/confirm";
import { createContentBoundingBox } from "../../../../../common/layout";
import { ITag } from "vott-react";
import { strings } from "../../../../../common/strings";
import { ExtendedSelectionMode } from "../editorPage";
import { Annotation, AnnotationTag, clearCanvas, getBoundingBox, getSegmentsFromSvg, SuperpixelCanvas } from "./superpixel-canvas/superpixelCanvas";

export interface ISegmentCanvasProps extends React.Props<SegmentCanvas> {
    selectedAsset: IAssetMetadata;
    selectionMode: ExtendedSelectionMode;
    project: IProject;
    canvasWidth: number;
    canvasHeight: number;
    svgFileName: string;
    lockedTag: string;
    children?: ReactElement<AssetPreview>;
    onAssetMetadataChanged?: (assetMetadata: IAssetMetadata) => void;
    onSelectedSegmentChanged?: (segment: ISegment) => void;
    onCanvasRendered?: (canvas: HTMLCanvasElement) => void;
}

const superpixelEditorId = "mainCanvas";

export interface ISegmentCanvasState {
    currentAsset: IAssetMetadata;
    contentSource: ContentSource;
    enabled: boolean;
    annotatedData: Annotation[];
    segmentationData: any; // json object
    gridOn: boolean;
}

export default class SegmentCanvas extends React.Component<ISegmentCanvasProps, ISegmentCanvasState> {
    public static defaultProps: ISegmentCanvasProps = {
        selectionMode: ExtendedSelectionMode.NONE,
        selectedAsset: null,
        canvasWidth: 0,
        canvasHeight: 0,
        project: null,
        lockedTag: undefined,
        svgFileName: "",
    };

    public state: ISegmentCanvasState = {
        currentAsset: this.props.selectedAsset,
        contentSource: null,
        enabled: true,
        annotatedData: null,
        segmentationData: null,
        gridOn: false,
    };

    public defaultColor = "black";

    private previousAnnotating = new Annotation( AnnotationTag.EMPTY, this.defaultColor);

    private canvasZone: React.RefObject<HTMLDivElement> = React.createRef();
    private clearConfirm: React.RefObject<Confirm> = React.createRef();
    
    private updateQueue: ISegmentOffset[] = [];
    private lastSelectedTag: string = AnnotationTag.EMPTY;

    public componentDidMount = () => {
        window.addEventListener("resize", this.onWindowResize);
        this.onSegmentsUpdated = this.onSegmentsUpdated.bind(this);
    }

    public componentWillUnmount() {
        window.removeEventListener("resize", this.onWindowResize);
    }

    public componentDidUpdate = async (prevProps: Readonly<ISegmentCanvasProps>, prevState: Readonly<ISegmentCanvasState>) => {
        if (this.props.project && !this.state.annotatedData) {
            this.setState({ currentAsset: this.props.selectedAsset,
                annotatedData: this.decomposeSegment(this.props.selectedAsset.segments, this.props.project.tags),
            });
            this.invalidateSelection();
        }
        // Handles asset changing
        else if (this.props.project && this.props.selectedAsset !== prevProps.selectedAsset) {
            //this.setState({segmentationData: null});
            //const segmentationData = await this.loadSegmentationData(this.props.selectedAsset.segmentationData.path);
            this.setState({ currentAsset: this.props.selectedAsset,
                annotatedData: this.decomposeSegment(this.props.selectedAsset.segments, this.props.project.tags),
            });
            //    segmentationData, });
            this.invalidateSelection();
        }

        // Handle selection mode changes
        if (this.props.selectionMode !== prevProps.selectionMode) {
            this.setSelectionMode(this.props.selectionMode);
        }

        const assetIdChanged = this.state.currentAsset.asset.id !== prevState.currentAsset.asset.id;

        // When the selected asset has changed but is still the same asset id
        if (!assetIdChanged && this.state.currentAsset !== prevState.currentAsset) {
            // this.refreshCanvas();
        }

        // When the project tags change re-apply tags to segments
        if (this.props.project && this.props.project.tags !== prevProps.project.tags) {
            this.updateCanvasToolsSegmentTags();
        }

        // Handles when the canvas is enabled & disabled
        if (prevState.enabled !== this.state.enabled) {
            // When the canvas is ready to display
            if (this.state.enabled) {
                this.setSelectionMode(this.props.selectionMode);
            } else { // When the canvas has been disabled
                this.setSelectionMode(ExtendedSelectionMode.NONE);
            }
        }
    }

    public invalidateSelection() {
        this.lastSelectedTag = AnnotationTag.EMPTY;
    }

    ////////////////////////////////////////////////////////////////
    // WARNING: this should be updated
    public updateCanvasToolsSegmentTags = (): void => {
        console.log("To be updated");
        for (const segment of this.state.currentAsset.segments) {
            /*
            this.editor.updateTagsById(
                segment.id,
                CanvasHelpers.getTagsDescriptor(this.props.project.tags, region),
            );
            */
        }
    }

    public setSelectionMode(selectionMode: ExtendedSelectionMode){
        if(selectionMode === ExtendedSelectionMode.NONE){
            this.updateAnnotating(AnnotationTag.EMPTY, this.defaultColor);
        }
        else if(selectionMode === ExtendedSelectionMode.DEANNOTATING){
            this.updateAnnotating(AnnotationTag.DEANNOTATING, this.defaultColor);
        }
        else if(selectionMode === ExtendedSelectionMode.ANNOTATING){
            this.updateAnnotating(this.previousAnnotating.tag, this.previousAnnotating.color);
        }
    }

    public getAnnotating = (): ITag => {
        const svg = document.getElementById(superpixelEditorId);
        return svg ? { name: svg.getAttribute("color-profile"),  color: svg.getAttribute("name") } : undefined;
    }

    public updateAnnotating(tag: string, color: string){
        const svg = document.getElementById(superpixelEditorId);
        if(svg){
            svg.setAttribute("color-profile", tag);
            svg.setAttribute("name", color);
            if(tag !== AnnotationTag.EMPTY && tag !== AnnotationTag.DEANNOTATING){
                this.previousAnnotating = new Annotation(tag, color);
            }
        }
    }

    public getSelectedSegment = (tag: string): ISegment => {
        if (tag){
            const selectedSegments = this.state.currentAsset.segments.filter( (s) => s.tag === tag );
            if (selectedSegments && selectedSegments.length) {
                return selectedSegments[0];
            }
        }
    }

    public confirmRemoveAllSegments = () => {
        this.clearConfirm.current.open();
    }

    ////////////////////////////////////////////////////////////////
    // WARNING: this should be updated
    /**
     * Toggles tag on all selected regions
     * @param selectedTag Tag name
     */
    public applyTag = (tag: ITag) => {
        this.updateAnnotating(tag.name, tag.color);
    }

    public render = () => {
        const className = this.state.enabled ? "canvas-enabled" : "canvas-disabled";
        return ( 
            <Fragment>
                <Confirm title={strings.editorPage.canvas.removeAllSegments.title}
                    ref={this.clearConfirm as any}
                    message={strings.editorPage.canvas.removeAllSegments.confirmation}
                    confirmButtonColor="danger"
                    onConfirm={this.removeAllSegments}
                />
                <div id="ct-zone" ref={this.canvasZone} className={className} onClick={(e) => e.stopPropagation()}>
                    <div id="selection-zone">
                        <SuperpixelCanvas id={superpixelEditorId} segmentationData={this.state.segmentationData} svgName={this.props.svgFileName} 
                        annotatedData={this.state.annotatedData} 
                        canvasWidth={this.props.canvasWidth} canvasHeight={this.props.canvasHeight} defaultColor={this.defaultColor} gridOn={this.state.gridOn}
                        isActivated={() => this.props.selectionMode !== ExtendedSelectionMode.NONE }
                        onSegmentsUpdated={this.onSegmentOffsetsUpdated} onSelectedTagUpdated={this.onSelectedTagUpdated} />
                    </div>
                </div>
                {this.renderChildren()}
            </Fragment>
        );
    }

    /**
     * Update regions within the current asset
     * @param segments
     * @param selectedRegions
     */
    public onSegmentsUpdated = (segments: ISegment[]) => {
        const currentAsset: IAssetMetadata = {
            ...this.state.currentAsset,
            segments,
        };
        this.setState({
            currentAsset,
        }, () => {
            this.props.onAssetMetadataChanged(currentAsset);
        });
    }

    public forceResize = (): void => {
        this.onWindowResize();
    }

    public refreshCanvas = () => {
        this.clearSegmentationData();
        /*
        // the function currently not used
        if (!this.state.currentAsset.segments || this.state.currentAsset.segments.length === 0) {
            return;
        }
        //this.removeAllSegments(false);
        */
       //this.setState({... this.state, annotatedData: this.decomposeSegment(this.state.currentAsset.segments), });
    }

    private onSelectedTagUpdated = async (
        tag: string,
    ): Promise<void> => {
        if (tag && this.props.selectionMode === ExtendedSelectionMode.NONE) {
            const selectedSegment = this.getSelectedSegment(tag);
            if (this.props.onSelectedSegmentChanged && this.lastSelectedTag !== tag) {
                this.props.onSelectedSegmentChanged(selectedSegment);
            }
            this.lastSelectedTag = tag;
        }
    }

    private clearSegmentationData(){
        this.setState( {... this.state, segmentationData: null});
    }

    private async loadSegmentationData(path: string){
        const response = await fetch(path
                ,{
                        headers : { 
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    }
                )
        return await response.json();
    }

    private decomposeSegment = (segments: ISegment[], tags: ITag[]): Annotation[] => {
        const annotation = [];
        for (const s of segments){
            for (const superpixel of s.superpixel){
                const tag = tags.filter((tag) => tag.name === s.tag);
                if(tag.length > 0){
                    annotation.push(new Annotation(s.tag, tag[0].color, superpixel));
                }
            }
        }
        return annotation;
    }

    private removeAllSegments = (removeState: boolean = true) => {
        clearCanvas(superpixelEditorId, this.defaultColor);
        if (removeState) {
            this.deleteSegmentsFromAsset(this.state.currentAsset.segments);
        }
    }

    private deleteSegmentsFromAsset = (segments: ISegment[]) => {
        const filteredSegments = this.state.currentAsset.segments.filter((assetSegment) => {
            return !segments.find((s) => s.id === assetSegment.id);
        });
        this.onSegmentsUpdated(filteredSegments);
    }

    private updateFromSvg = () => {
        const segments = getSegmentsFromSvg(superpixelEditorId);
        if (segments.length > 0 || this.state.currentAsset.segments.length > 0){
            const integratedSegments = segments.map( (e) => {
                const getElementWithSameTag = (s) => {
                    return s.tag === e.tag;
                }
                const findOne = this.state.currentAsset.segments.find(getElementWithSameTag);
                if (findOne) {
                    e.id = findOne.id;
                    e.risk = findOne.risk;
                    e.iscrowd = findOne.iscrowd;
                } else {
                    e.id = shortid.generate();
                }
                return e;
            });
            this.onSegmentsUpdated(integratedSegments);
        }
    }

    private onSegmentOffsetsUpdated = (offsets: ISegmentOffset[], applyNow: boolean = false) => {
        if (applyNow) {
            this.updateFromSvg();
        }
        else{
            offsets.forEach((item: ISegmentOffset) => this.updateQueue.findIndex(x => x.superpixelId===item.superpixelId) < 0 ? this.updateQueue.push(item) : undefined );
        }
    }

    private renderChildren = () => {
        return React.cloneElement(this.props.children, {
            onAssetChanged: this.onAssetChanged,
            onLoaded: this.onAssetLoaded,
            onError: this.onAssetError,
            onActivated: this.onAssetActivated,
            onDeactivated: this.onAssetDeactivated,
        });
    }

    /**
     * Raised when the asset bound to the asset preview has changed
     */
    private onAssetChanged = () => {
        this.setState({ enabled: false });
    }

    /**
     * Raised when the underlying asset has completed loading
     */
    private onAssetLoaded = (contentSource: ContentSource) => {
        this.setState({ contentSource });
        this.positionCanvas(contentSource);
    }

    private onAssetError = () => {
        this.setState({
            enabled: false,
        });
    }

    /**
     * Raised when the asset is taking control over the rendering
     */
    private onAssetActivated = () => {
        this.setState({ enabled: false });
    }

    /**
     * Raise when the asset is handing off control of rendering
     */
    private onAssetDeactivated = (contentSource: ContentSource) => {
        this.setState({
            contentSource,
            enabled: true,
        });
    }

    /**
     * Positions the canvas tools drawing surface to be exactly over the asset content
     */
    private positionCanvas = (contentSource: ContentSource) => {
        if (!contentSource) {
            return;
        }

        const canvas = this.canvasZone.current;
        if (canvas) {
            const boundingBox = createContentBoundingBox(contentSource);
            canvas.style.top = `${boundingBox.top}px`;
            canvas.style.left = `${boundingBox.left}px`;
            canvas.style.width = `${boundingBox.width}px`;
            canvas.style.height = `${boundingBox.height}px`;
        }
    }

    /**
     * Resizes and re-renders the canvas when the application window size changes
     */
    private onWindowResize = async () => {
        if (!this.state.contentSource) {
            return;
        }

        this.positionCanvas(this.state.contentSource);
    }


}
