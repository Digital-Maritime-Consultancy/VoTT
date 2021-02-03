import { projectCanvas } from './../../react/components/pages/editorPage/segment/superpixel-canvas/canvasProjector';
import _ from "lodash";
import { ExportProvider } from "./exportProvider";
import { IProject, IExportProviderOptions, IAssetMetadata, IRegion, IAsset, RegionType, ISegment } from "../../models/applicationState";
import Guard from "../../common/guard";
import { constants } from "../../common/constants";
import HtmlFileReader from "../../common/htmlFileReader";

import svgToPng from "save-svg-as-png";
const Snap = require("snapsvg-cjs");
/**
 * MOAD Json Export Provider options
 */
export interface IMoadJsonExportProviderOptions extends IExportProviderOptions {
    /** Whether or not to include binary assets in target connection */
    includeLabelImages: boolean;
    exportIndividuals: boolean;
    includeSegmentAnnotatedImages: boolean;
    strict: boolean;
}

const geometryFolderName = "moad-json-export/geometry/";
const segmentFolderName = "moad-json-export/segmentation/";
const segmentPngFolderName = "moad-json-export/segmentation/png/";

/**
 * @name - MOAD Json Export Provider
 * @description - Exports a project into a single JSON file that include all configured assets
 */
export class MoadJsonExportProvider extends ExportProvider<IMoadJsonExportProviderOptions> {
    constructor(project: IProject, options: IMoadJsonExportProviderOptions) {
        super(project, options);
        Guard.null(options);
    }

    /**
     * Export project to VoTT JSON format
     */
    public async export(): Promise<void> {
        const results = await this.getAssetsForExport();

        if (this.options.includeImages) {
            await results.forEachAsync(async (assetMetadata) => {
                const arrayBuffer = await HtmlFileReader.getAssetArray(assetMetadata.asset);
                const assetFilePath = `moad-json-export/${assetMetadata.asset.name}`;
                await this.storageProvider.writeBinary(assetFilePath, Buffer.from(arrayBuffer));
            });
        }

        const exportObject = { ...this.project };
        exportObject.assets = _.keyBy(results, (assetMetadata) => assetMetadata.asset.id) as any;

        // We don't need these fields in the export JSON
        delete exportObject.sourceConnection;
        delete exportObject.metadataConnection;
        delete exportObject.targetConnection;
        delete exportObject.exportFormat;
        if (this.options.exportIndividuals) {
            const assets = exportObject.assets;
            const keys: string[] = [];
            if (keys.length === 0) {
                for (const k in assets) {
                    keys.push(k);
                }
            }
            const assetMetadata: IAssetMetadata[] = [];
            keys.map( (key) => {const d: any = assets[key]; assetMetadata.push(d as IAssetMetadata)});

            assetMetadata.forEach(async (item) => {
                if( item.regions && item.regions.length) {
                    const fileName = `${geometryFolderName}${item.asset.name.replace(/\s/g, "-")}_BBPG_data.json`;
                    const arrayBuffer = await HtmlFileReader.getAssetArray(item.asset);
                    const imageFile = Buffer.from(arrayBuffer).toString('base64');
                    const json = !this.options.strict ?
                        this.regions2BBPG(item.regions, item.asset, this.options.strict, imageFile,
                            async (json: object) =>
                                await this.storageProvider.writeText(fileName, JSON.stringify(json, null, 4)))
                        : this.regions2BBPG(item.regions, item.asset, this.options.strict, undefined,
                            async (json: object) =>
                                await this.storageProvider.writeText(fileName, JSON.stringify(json, null, 4)));
                }
                if( item.segments && item.segments.length) {
                    const fileName = `${segmentFolderName}${item.asset.name.replace(/\s/g, "-")}_PS_data.json`;
                    await this.segments2PS(item.segments, item.asset, item.svg, this.options.strict,
                        async (json: object) => {
                            await this.storageProvider.writeText(fileName, JSON.stringify(json, null, 4));
                    });
                }
                if (this.options.includeSegmentAnnotatedImages && item.svg) {
                    const svgFileName = item.svg.name;
                    const onSVGLoaded = (data) => {
                        svgToPng.svgAsPngUri(data.node, "", {backgroundColor: "#000000"})
                            .then((uri: string) =>
                                this.storageProvider.writeBinary(
                                    segmentPngFolderName + svgFileName.replace(".svg", "") + ".png",
                                    Buffer.from(uri.replace("data:image/png;base64,", ""), "base64")));
                    }
                    await Snap.load(item.svg.path, onSVGLoaded);
                }
            });
        } else {
            const fileName =
                `moad-json-export/${this.project.name.replace(/\s/g, "-")}${constants.exportFileExtension}`;
            await this.storageProvider.writeText(fileName, JSON.stringify(exportObject, null, 4));
        }
    }

    private async segments2PS(segments: ISegment[], asset: IAsset, svg: IAsset,
                              strict: boolean = false, callback: (json: object) => void) {
        if (!strict && svg) {
            const onSVGLoaded = (data) => {
                const points = projectCanvas(data, segments);
                callback(segments.map( (segment, index) => this.segment2PS(segment, svg, points, index)));
            }
            await Snap.load(svg.path, onSVGLoaded);
        } else {
            callback(segments.map( (segment) => this.segment2PSStrict(segment, asset)));
        }
    }

    private segment2PS(segment: ISegment, svg: IAsset, points: number[][], index: number){
        return {
            id: index,
            isthing: false,
            category_id: segment.tag,
            area: segment.area,
            polygon: points,
            mask_path: svg.path.replace(".jpg.svg", "_mask.png"),
        };
    }

    private segment2PSStrict(segment: ISegment, asset: IAsset){
        return {
            id: segment.id,
            image_id: asset.id,
            category_id: segment.tag,
            segmentation_method_id: 0,
            superpixel : segment.superpixel,
            area: segment.area,
            bbox: segment.boundingBox,
            iscrowd: segment.iscrowd,
            risk: segment.risk,
        };
    }

    private regions2BBPG(regions: IRegion[], asset: IAsset, strict: boolean = false,
                         imageFile: any, callback: (json: object) => void){
        if (!strict && imageFile) {
            callback(
                { version: "4.5.6", flags: {},
                    shapes: regions.map( (region) => this.region2BBPG(region, asset)),
                    imagePath: asset.name,
                    imageData: imageFile,
                    imageHeight: asset.size.height,
                    imageWidth: asset.size.width }
            );
        } else {
            callback(regions.map( (region) => this.region2BBPGStrict(region, asset)));
        }
    }

    private region2BBPGStrict(region: IRegion, asset: IAsset) {
        return {
            id: region.id,
            image_id: asset.id,
            category_id: region.tag,
            type: region.type === RegionType.Rectangle ? "boundingbox" :
                    region.type === RegionType.Polygon ? "polygon" :
                    region.type === RegionType.Polyline ? "polyline" :
                    "etc",
            segmentation : region.points,
            properties : {},
            area: region.area,
            bbox: region.boundingBox,
            isobscured: region.isobscured,
            istruncated: region.istruncated,
            risk: region.risk,
        };
    }

    private region2BBPG(region: IRegion, asset: IAsset) {
        return {
            label: region.tag,
            points : region.points.map( (e) => [e.x, e.y]),
            group_id: null,
            shape_type: region.type === RegionType.Rectangle ? "boundingbox" :
                    region.type === RegionType.Polygon ? "polygon" :
                    region.type === RegionType.Polyline ? "polyline" :
                    "etc",
            flags : {},
        };
    }
}
