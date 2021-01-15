import MD5 from "md5.js";
import _ from "lodash";
import * as shortid from "shortid";
import Guard from "../common/guard";
import {
    IAsset, AssetType, IProject, IAssetMetadata, AssetState,
    IRegion, RegionType, ITFRecordMetadata, EditorContext, ISegment,
} from "../models/applicationState";
import { AssetProviderFactory, IAssetProvider } from "../providers/storage/assetProviderFactory";
import { StorageProviderFactory, IStorageProvider } from "../providers/storage/storageProviderFactory";
import { constants } from "../common/constants";
import HtmlFileReader from "../common/htmlFileReader";
import { TFRecordsReader } from "../providers/export/tensorFlowRecords/tensorFlowReader";
import { FeatureType } from "../providers/export/tensorFlowRecords/tensorFlowBuilder";
import { appInfo } from "../common/appInfo";
import { encodeFileURI } from "../common/utils";

/**
 * @name - Asset Service
 * @description - Functions for dealing with project assets
 */
export class AssetService {

    /**
     * Create IAsset from filePath
     * @param assetFilePath - filepath of asset
     * @param assetFileName - name of asset
     */
    public static createAssetFromFilePath(
        assetFilePath: string,
        assetFileName?: string,
        assetIdentifier?: string): IAsset {
    Guard.empty(assetFilePath);
    const normalizedPath = assetFilePath.toLowerCase();

    // If the path is not already prefixed with a protocol
    // then assume it comes from the local file system
    if (!normalizedPath.startsWith("http://") &&
        !normalizedPath.startsWith("https://") &&
        !normalizedPath.startsWith("file:")) {
        // First replace \ character with / the do the standard url encoding then encode unsupported characters
        assetFilePath = encodeFileURI(assetFilePath, true);
    }

    const md5Hash = new MD5().update(assetIdentifier).digest("hex");
    const pathParts = assetFilePath.split(/[\\\/]/);
    // Example filename: video.mp4#t=5
    // fileNameParts[0] = "video"
    // fileNameParts[1] = "mp4"
    // fileNameParts[2] = "t=5"
    assetFileName = assetFileName || pathParts[pathParts.length - 1];
    const fileNameParts = assetFileName.split(".");
    const extensionParts = fileNameParts[fileNameParts.length - 1].split(/[\?#]/);
    const assetFormat = extensionParts[0];

    const assetType = this.getAssetType(assetFormat);
    return {
        id: md5Hash,
        format: assetFormat,
        state: { [EditorContext.Geometry]: AssetState.NotVisited, [EditorContext.Segment]: AssetState.NotVisited, [EditorContext.Metadata]: AssetState.NotVisited, },
        type: assetType,
        name: assetFileName,
        path: assetFilePath,
        size: null,
    };
    }

    /**
     * Get Asset Type from format (file extension)
     * @param format - File extension of asset
     */
    public static getAssetType(format: string): AssetType {
        switch (format.toLowerCase()) {
            case "gif":
            case "jpg":
            case "jpeg":
            case "tif":
            case "tiff":
            case "png":
            case "bmp":
                return AssetType.Image;
            case "mp4":
            case "mov":
            case "avi":
            case "m4v":
            case "mpg":
            case "wmv":
                return AssetType.Video;
            case "tfrecord":
                return AssetType.TFRecord;
            case "json":
                return AssetType.ImageMetadata;
            case "svg":
                return AssetType.SvgImage;
            default:
                return AssetType.Unknown;
        }
    }

    private assetProviderInstance: IAssetProvider;
    private metadataImportProviderInstance: IAssetProvider;
    private metadataExportProviderInstance: IStorageProvider;
    private storageProviderInstance: IStorageProvider;

    constructor(private project: IProject) {
        Guard.null(project);
    }

    /**
     * Get Asset Provider from project's source connction
     */
    protected get assetProvider(): IAssetProvider {
        if (!this.assetProviderInstance) {
            this.assetProviderInstance = AssetProviderFactory.create(
                this.project.sourceConnection.providerType,
                this.project.sourceConnection.providerOptions,
            );

            return this.assetProviderInstance;
        }
    }

    /**
     * Get Asset Provider from project's source connction
     */
    protected get metadataImportProvider(): IAssetProvider {
        if (!this.metadataImportProviderInstance) {
            this.metadataImportProviderInstance = AssetProviderFactory.create(
                this.project.metadataConnection.providerType,
                this.project.metadataConnection.providerOptions,
            );

            return this.metadataImportProviderInstance;
        }
    }

    /**
     * Get Asset Provider from project's source connction
     */
    protected get metadataExportProvider(): IStorageProvider {
        if (!this.metadataExportProviderInstance) {
            this.metadataExportProviderInstance = StorageProviderFactory.create(
                this.project.metadataConnection.providerType,
                this.project.metadataConnection.providerOptions,
            );

            return this.metadataExportProviderInstance;
        }
    }

    /**
     * Get Storage Provider from project's target connection
     */
    protected get storageProvider(): IStorageProvider {
        if (!this.storageProviderInstance) {
            this.storageProviderInstance = StorageProviderFactory.create(
                this.project.targetConnection.providerType,
                this.project.targetConnection.providerOptions,
            );
        }
        return this.storageProviderInstance;
    }

    /**
     * Get assets from provider
     */
    public async getAssets(): Promise<IAsset[]> {
        return await this.assetProvider.getAssets();
    }

    /**
     * Get segmentation data from provider
     */
    public async getSvg(): Promise<IAsset[]> {
        const assets = await this.metadataImportProvider.getAssets();
        return assets.filter((e) => e.format === 'svg');
    }

    /**
     * Get a list of child assets associated with the current asset
     * @param rootAsset The parent asset to search
     */
    public getChildAssets(rootAsset: IAsset): IAsset[] {
        Guard.null(rootAsset);

        if (rootAsset.type !== AssetType.Video) {
            return [];
        }

        return _
            .values(this.project.assets)
            .filter((asset) => asset.parent && asset.parent.id === rootAsset.id)
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Save metadata for asset
     * @param metadata - Metadata for asset
     */
    public async saveSvg(fileName: string, content: string): Promise<string> {
        Guard.null(content);

        try {
            const buf = Buffer.from(content);
            await this.metadataExportProvider.writeBinary(fileName, buf);
        } catch (err) {
            // The file may not exist - that's OK
        }
        return fileName;
    }

    /**
     * Save metadata for asset
     * @param metadata - Metadata for asset
     */
    public async save(metadata: IAssetMetadata): Promise<IAssetMetadata> {
        Guard.null(metadata);

        const fileName = `${metadata.asset.id}${constants.assetMetadataFileExtension}`;

        // Only save asset metadata if asset is in a tagged state
        // Otherwise primary asset information is already persisted in the project file.
        if (metadata.asset.state[EditorContext.Geometry] === AssetState.Tagged ||
            metadata.asset.state[EditorContext.Segment] === AssetState.Tagged) {
            await this.storageProvider.writeText(fileName, JSON.stringify(metadata, null, 4));
        } else {
            // If the asset is no longer tagged, then it doesn't contain any regions
            // and the file is not required.
            try {
                await this.storageProvider.deleteFile(fileName);
            } catch (err) {
                // The file may not exist - that's OK
            }
        }
        return metadata;
    }

    /**
     * Get metadata for asset
     * @param asset - Asset for which to retrieve metadata
     */
    public async getAssetMetadata(asset: IAsset): Promise<IAssetMetadata> {
        Guard.null(asset);

        const fileName = `${asset.id}${constants.assetMetadataFileExtension}`;
        try {
            const json = await this.storageProvider.readText(fileName);
            return JSON.parse(json) as IAssetMetadata;
        } catch (err) {
            if (asset.type === AssetType.TFRecord) {
                return {
                    asset: { ...asset },
                    regions: await this.getRegionsFromTFRecord(asset),
                    segments: await this.getSegmentsFromTFRecord(asset),
                    svg: undefined,
                    version: appInfo.version,
                };
            } else {
                return {
                    asset: { ...asset },
                    regions: [],
                    segments: [],
                    svg: undefined,
                    version: appInfo.version,
                };
            }
        }
    }

    /**
     * Delete a tag from asset metadata files
     * @param tagName Name of tag to delete
     */
    public async deleteTag(tagName: string): Promise<IAssetMetadata[]> {
        const transformer = (tags) => tags.filter((t) => t !== tagName);
        return await this.getUpdatedAssets(tagName, transformer);
    }

    /**
     * Rename a tag within asset metadata files
     * @param tagName Name of tag to rename
     */
    public async renameTag(tagName: string, newTagName: string): Promise<IAssetMetadata[]> {
        const transformer = (tags) => tags.map((t) => (t === tagName) ? newTagName : t);
        return await this.getUpdatedAssets(tagName, transformer);
    }

    /**
     * Update tags within asset metadata files
     * @param tagName Name of tag to update within project
     * @param transformer Function that accepts array of tags from a region and returns a modified array of tags
     */
    private async getUpdatedAssets(tagName: string, transformer: (tags: string[]) => string[])
        : Promise<IAssetMetadata[]> {
        // Loop over assets and update if necessary
        const updates = await _.values(this.project.assets).mapAsync(async (asset) => {
            const assetMetadata = await this.getAssetMetadata(asset);
            const isUpdated = this.updateTagInAssetMetadata(assetMetadata, tagName, transformer);

            return isUpdated ? assetMetadata : null;
        });

        return updates.filter((assetMetadata) => !!assetMetadata);
    }

    ////////////////////////////////////////////////////////////////
    // WARNING: should be updated
    /**
     * Update tag within asset metadata object
     * @param assetMetadata Asset metadata to update
     * @param tagName Name of tag being updated
     * @param transformer Function that accepts array of tags from a region and returns a modified array of tags
     * @returns Modified asset metadata object or null if object does not need to be modified
     */
    private updateTagInAssetMetadata(
        assetMetadata: IAssetMetadata,
        tagName: string,
        transformer: (tags: string[]) => string[]): boolean {
        let foundTag = false;

        for (const region of assetMetadata.regions) {
            if (region.tag === tagName) {
                foundTag = true;
            }
        }
        if (foundTag) {
            assetMetadata.regions = assetMetadata.regions.filter((region) => region.tag ? region.tag.length === 0 : undefined);
            assetMetadata.asset.state[EditorContext.Geometry] = (assetMetadata.regions.length) ? AssetState.Tagged : AssetState.Visited;
            return true;
        }

        return false;
    }

    ////////////////////////////////////////////////////////////////
    // WARNING: should be updated
    private async getSegmentsFromTFRecord(asset: IAsset): Promise<ISegment[]> {
        return [];
    }

    private async getRegionsFromTFRecord(asset: IAsset): Promise<IRegion[]> {
        const objectArray = await this.getTFRecordMetadata(asset);
        const regions: IRegion[] = [];

        // Add Regions from TFRecord in Regions
        for (let index = 0; index < objectArray.textArray.length; index++) {
            regions.push({
                id: shortid.generate(),
                type: RegionType.Rectangle,
                tag: objectArray.textArray[index],
                boundingBox: {
                    left: objectArray.xminArray[index] * objectArray.width,
                    top: objectArray.yminArray[index] * objectArray.height,
                    width: (objectArray.xmaxArray[index] - objectArray.xminArray[index]) * objectArray.width,
                    height: (objectArray.ymaxArray[index] - objectArray.yminArray[index]) * objectArray.height,
                },
                points: [{
                    x: objectArray.xminArray[index] * objectArray.width,
                    y: objectArray.yminArray[index] * objectArray.height,
                },
                {
                    x: objectArray.xmaxArray[index] * objectArray.width,
                    y: objectArray.ymaxArray[index] * objectArray.height,
                }],
                area: 0,
                isobscured: 0,
                istruncated: 0,
                risk: "safe",
            });
        }

        return regions;
    }

    private async getTFRecordMetadata(asset: IAsset): Promise<ITFRecordMetadata> {
        const tfrecords = new Buffer(await HtmlFileReader.getAssetArray(asset));
        const reader = new TFRecordsReader(tfrecords);

        const width = reader.getFeature(0, "image/width", FeatureType.Int64) as number;
        const height = reader.getFeature(0, "image/height", FeatureType.Int64) as number;

        const xminArray = reader.getArrayFeature(0, "image/object/bbox/xmin", FeatureType.Float) as number[];
        const yminArray = reader.getArrayFeature(0, "image/object/bbox/ymin", FeatureType.Float) as number[];
        const xmaxArray = reader.getArrayFeature(0, "image/object/bbox/xmax", FeatureType.Float) as number[];
        const ymaxArray = reader.getArrayFeature(0, "image/object/bbox/ymax", FeatureType.Float) as number[];
        const textArray = reader.getArrayFeature(0, "image/object/class/text", FeatureType.String) as string[];

        return { width, height, xminArray, yminArray, xmaxArray, ymaxArray, textArray };
    }
}
