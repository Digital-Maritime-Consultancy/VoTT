import { Annotation, AnnotationTag, ICoordinates, number2SPId } from "./superpixelCanvas";

const React = require("react");
const { useEffect } = require("react");
const Snap = require("snapsvg-cjs");

const Direction = {
    UP: 0,
    RIGHT: 1,
    DOWN: 2,
    LEFT: 3
}

const defaultAnnotation = (id: number) => new Annotation(AnnotationTag.EMPTY, AnnotationTag.EMPTY, id);

interface CanvasSVGCreatorProps {
    id: string, canvasWidth: number, canvasHeight: number, segmentationData: any,
    defaultColor: string, defaultOpacity: number, defaultLineWidth: number,
    onCanvasSVGCreated: (...params: any[]) => void,
}

export const CanvasSVGCreator: React.FC<CanvasSVGCreatorProps> = 
({id, canvasWidth, canvasHeight, segmentationData, defaultColor, defaultOpacity, defaultLineWidth, onCanvasSVGCreated}) => {
    useEffect( () => {
        var s = Snap("#" + id);
        if (s && s.selectAll("path").length){
            s.clear();
        }
        // create superpixels
        const keys: number[] = [];
        if (keys.length === 0) {
            for (let k in segmentationData) keys.push(parseInt(k));
        }
        keys.map(key => {
            const annotation = defaultAnnotation(key);
            const pixels = segmentationData[String(key)].split(",");
            const superpixel = s.path(
                getPathFromPoints(
                    pixels,
                    canvasWidth,
                    canvasHeight));
            superpixel.attr({ id: number2SPId(key), key, stroke: "white", strokeWidth: defaultLineWidth,
            fill: defaultColor,
            opacity: defaultOpacity,
            tag: annotation.tag,
            name: annotation.color,
            area: pixels.length });
            return superpixel;
        });
        onCanvasSVGCreated();
    });

    const getPathFromPoints = (points: any, canvasWidth: number, canvasHeight :number) => {
        const gridWidth = canvasWidth + 1;
        const gridHeight = canvasHeight + 1;
        if(points===undefined || points.length===0)
            return undefined;
        var currentPoint= convertImg2Grid(parseInt(points[0]), canvasWidth, gridWidth);
        const startPoint = currentPoint;
        var pathString = "M "+convert2Point(currentPoint, gridWidth).join(" ")+" ";
        var traverseDirection = Direction.RIGHT;
        var count = 0;
        var coordinates = {gridWidth: gridWidth, gridHeight: gridHeight, canvasWidth: canvasWidth, canvasHeight: canvasHeight};
        do{       
            if (traverseDirection === Direction.RIGHT && checkMembership(points, addOffset(currentPoint, [0, -1], gridWidth), coordinates)){
                traverseDirection = (traverseDirection + 3 ) % 4;
                [ pathString, currentPoint ] = stepForward(currentPoint, traverseDirection, pathString, gridWidth);
            } else if (traverseDirection === Direction.RIGHT && checkMembership(points, currentPoint, coordinates)){
                [ pathString, currentPoint ] = stepForward(currentPoint, Direction.RIGHT, pathString, gridWidth);
            } else if (traverseDirection === Direction.DOWN && checkMembership(points, currentPoint, coordinates)){
                traverseDirection = (traverseDirection + 3 ) % 4;
                [ pathString, currentPoint ] = stepForward(currentPoint, traverseDirection, pathString, gridWidth);
            } else if (traverseDirection === Direction.DOWN && checkMembership(points, addOffset(currentPoint, [-1, 0], gridWidth), coordinates)){ 
                [ pathString, currentPoint ] = stepForward(currentPoint, Direction.DOWN, pathString, gridWidth);
            } else if (traverseDirection === Direction.LEFT && checkMembership(points, addOffset(currentPoint, [-1, 0], gridWidth), coordinates)){ 
                traverseDirection = (traverseDirection + 3 ) % 4;
                [ pathString, currentPoint ] = stepForward(currentPoint, traverseDirection, pathString, gridWidth);
            } else if (traverseDirection === Direction.LEFT && checkMembership(points, addOffset(currentPoint, [-1, -1], gridWidth), coordinates)){ 
                [ pathString, currentPoint ] = stepForward(currentPoint, Direction.LEFT, pathString, gridWidth);
            } else if (traverseDirection === Direction.UP && checkMembership(points, addOffset(currentPoint, [-1, -1], gridWidth), coordinates)){ 
                traverseDirection = (traverseDirection + 3 ) % 4;
                [ pathString, currentPoint ] = stepForward(currentPoint, traverseDirection, pathString, gridWidth);
            } else if (traverseDirection === Direction.UP && checkMembership(points, addOffset(currentPoint, [0, -1], gridWidth), coordinates)){ 
                [ pathString, currentPoint ] = stepForward(currentPoint, Direction.UP, pathString, gridWidth);
            } else {
                traverseDirection = (traverseDirection + 1 ) % 4;
            }
            count += 1;
        } while(currentPoint !== startPoint && count < 1000);
        return pathString + "Z";
    }
    
    const addOffset = (point: number, offset: number[], gridWidth: number): number => {
        return point + offset[0] + (offset[1] * gridWidth);
    }
    
    const convertGrid2Img = (index: number, gridWidth: number, canvasWidth: number): number => {
        return index % gridWidth + Math.floor(index / gridWidth) * canvasWidth;
    }
    
    const convertImg2Grid = (index: number, canvasWidth: number, gridWidth: number): number => {
        return index % canvasWidth + Math.floor(index / canvasWidth) * gridWidth;
    }

    const convert2Point = (index: number, gridWidth: number): number[] => {
        return [ index%gridWidth, Math.floor(index/gridWidth) ];
    }

    const checkMembership = (points: string[], gridPoint: number, coordinates: ICoordinates): boolean =>{
        if(gridPoint < 0 || gridPoint % coordinates.gridWidth >= coordinates.canvasWidth || Math.floor(gridPoint / coordinates.gridWidth) >= coordinates.canvasHeight) // exclude grid edges
            return false;
        else
            return points.includes(String(convertGrid2Img(gridPoint, coordinates.gridWidth, coordinates.canvasWidth)));
    }

    const moveAlongDirection = (point: number, direction: number, gridWidth: number): number => {
        switch (direction){
            case Direction.UP:
                return addOffset(point, [0, -1], gridWidth);
            case Direction.DOWN:
                return addOffset(point, [0, 1], gridWidth);
            case Direction.LEFT:
                return addOffset(point, [-1, 0], gridWidth);
            case Direction.RIGHT:
                return addOffset(point, [1, 0], gridWidth);
            default:
                return point;
        }
    }
    
    const stepForward = (currentPoint: number, direction: number, pathString: string, gridWidth: number): [ string, number ] => {
        let newPoint = moveAlongDirection(currentPoint, direction, gridWidth);
        let newPathString = pathString + "L "+ convert2Point(newPoint, gridWidth).join(" ")+" ";
        return [ newPathString,  newPoint ];
    }

    const viewBoxString = [0, 0, canvasWidth, canvasHeight].join(
        " "
    );
    return <svg xmlnsXlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" width={canvasWidth} height={canvasHeight} key={id} id={id} colorProfile={AnnotationTag.EMPTY} name={defaultColor} viewBox={viewBoxString}></svg>
}