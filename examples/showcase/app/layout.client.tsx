import {
  inspectDocument,
  installNavigationPanel,
} from "../navigation-diagnostics";
export default function initializeLayout(): void {
  installNavigationPanel(inspectDocument);
}
