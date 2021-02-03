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
import { Annotation, AnnotationTag, clearCanvas, getAnnotatingTag, getBoundingBox, getSegmentsFromSvg, getSvgContent, SuperpixelCanvas } from "./superpixel-canvas/superpixelCanvas";
import { saveSvg } from "../../../../../redux/actions/projectActions";

export interface ISegmentCanvasProps extends React.Props<SegmentCanvas> {
    selectedAsset: IAssetMetadata;
    selectionMode: ExtendedSelectionMode;
    project: IProject;
    canvasWidth: number;
    canvasHeight: number;
    svgFileName: string;
    selectedTag: ITag;
    lockedTag: string;
    children?: ReactElement<AssetPreview>;
    onAssetMetadataChanged?: (assetMetadata: IAssetMetadata) => void;
    onSelectedSegmentChanged?: (segment: ISegment) => void;
    onSaveSvg?: (fileName: string, content: string) => void;
    onCanvasRendered?: (canvas: HTMLCanvasElement) => void;
}

const canvasId = "mainCanvas";

export interface ISegmentCanvasState {
    currentAsset: IAssetMetadata;
    contentSource: ContentSource;
    enabled: boolean;
    annotatedData: Annotation[];
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
        selectedTag: undefined,
    };

    public state: ISegmentCanvasState = {
        currentAsset: this.props.selectedAsset,
        contentSource: null,
        enabled: true,
        annotatedData: null,
        gridOn: false,
    };

    public defaultColor = "black";

    private previousAnnotating = new Annotation( AnnotationTag.EMPTY, this.defaultColor);

    private canvasZone: React.RefObject<HTMLDivElement> = React.createRef();
    private clearConfirm: React.RefObject<Confirm> = React.createRef();
    private lastSelectedTag: string = AnnotationTag.EMPTY;

    public componentDidMount = () => {
        window.addEventListener("resize", this.onWindowResize);
        this.onSegmentsUpdated = this.onSegmentsUpdated.bind(this);
    }

    public componentWillUnmount() {
        this.storeCurrentCanvas();
        window.removeEventListener("resize", this.onWindowResize);
    }

    public componentDidUpdate = async (prevProps: Readonly<ISegmentCanvasProps>, prevState: Readonly<ISegmentCanvasState>) => {
        if (this.props.project && !this.state.annotatedData) {
            this.setState({ currentAsset: this.props.selectedAsset,
                annotatedData: this.decomposeSegment(this.props.selectedAsset.segments, this.props.project.tags),
            });
            this.applyingAnnotatingFromParent();
            this.invalidateSelection();
        }
        // Handles asset changing
        else if (this.props.project && this.props.selectedAsset !== prevProps.selectedAsset) {
            this.setState({ currentAsset: this.props.selectedAsset,
                annotatedData: this.decomposeSegment(this.props.selectedAsset.segments, this.props.project.tags),
            });
            this.applyingAnnotatingFromParent();
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

    public setGridOn = (value: boolean) => {
        this.setState({gridOn: value});
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
        return getAnnotatingTag(canvasId);
    }

    public updateAnnotating(tag: string, color: string){
        const svg = document.getElementById(canvasId);
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
                        <SuperpixelCanvas id={canvasId} svgName={this.props.svgFileName} 
                        annotatedData={this.state.annotatedData} 
                        annotating={this.props.selectedTag} defaultColor={this.defaultColor} gridOn={this.state.gridOn}
                        getCurrentMode={() => this.props.selectionMode} onCanvasUpdated={this.onCanvasUpdated} />
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

    public storeCurrentCanvas = async() => {
        const element = document.getElementById(canvasId);
        await this.updateStateFromSvg();
        await this.storeSvgFile(element);
    }

    public updateStateFromSvg = () => {
        const segments = getSegmentsFromSvg(canvasId);
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
            this.onSegmentsUpdated(integratedSegments.filter((e) => e.superpixel.length));
        }
    }

    public forceResize = (): void => {
        this.onWindowResize();
    }

    private applyingAnnotatingFromParent = () => {
        if (this.props.selectionMode === ExtendedSelectionMode.ANNOTATING){
            if (this.props.selectedTag) {
                this.applyTag(this.props.selectedTag);
            }
        }
    }

    private invalidateSelection() {
        this.lastSelectedTag = AnnotationTag.EMPTY;
    }

    private getDummySegment = (tag: string): ISegment => {
        return { id: shortid.generate().toString(), tag, superpixel: [], area: 0, boundingBox: undefined, iscrowd: 0, risk: "safe" };
    }

    private onCanvasUpdated = async (
        tag: string,
    ): Promise<void> => {
        if (tag && this.props.selectionMode === ExtendedSelectionMode.NONE) { // mouse up for selection
            const selectedSegment = this.getSelectedSegment(tag);
            if (this.props.onSelectedSegmentChanged && this.lastSelectedTag !== tag) {
                this.props.onSelectedSegmentChanged(selectedSegment);
            }
            this.lastSelectedTag = tag;
        }
        else if (tag) { // mouse up for annotation
            const selectedSegment = this.getSelectedSegment(tag);
            if (!selectedSegment && tag !== AnnotationTag.EMPTY) {
                const segments = [ ...this.state.currentAsset.segments, this.getDummySegment(tag) ];
                this.onSegmentsUpdated(segments);
            }
        }
    }

    private storeSvgFile = (canvasElement: HTMLElement) => {
        if (this.state.currentAsset.svg) {
            this.props.onSaveSvg(this.state.currentAsset.svg.name, getSvgContent(canvasElement) );
        }
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
        clearCanvas(canvasId, this.defaultColor);
        this.storeSvgFile(document.getElementById(canvasId));
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
