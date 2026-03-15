import { type ArrayDataValue, type NodeId, type StringDataValue } from '@ironclad/rivet-core';

type UserInputSubmitHandler = (nodeId: NodeId, answers: ArrayDataValue<StringDataValue>) => void;

let submitHandler: UserInputSubmitHandler = () => {};

export function setUserInputSubmitHandler(handler: UserInputSubmitHandler): void {
  submitHandler = handler;
}

export function clearUserInputSubmitHandler(): void {
  submitHandler = () => {};
}

export function submitUserInputAnswers(nodeId: NodeId, answers: ArrayDataValue<StringDataValue>): void {
  submitHandler(nodeId, answers);
}
