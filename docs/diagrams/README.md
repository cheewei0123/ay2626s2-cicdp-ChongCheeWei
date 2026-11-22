# Diagrams

Mermaid sources for the diagrams in the report. GitHub draws the same Mermaid inline in the docs linked below; the PNGs were rendered locally (mermaid 11.4.1 in a headless browser) so nothing was sent to an online renderer.

| Diagram                    | Source                           | Image                                                                      | Shown in                                                   |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Containers                 | `README.md` (Architecture)       | [kan-69-container-diagram.png](../evidence/kan-69-container-diagram.png)   | [README](../../README.md)                                  |
| Deployment (one EC2 + RDS) | [deployment.mmd](deployment.mmd) | [kan-57-deployment-diagram.png](../evidence/kan-57-deployment-diagram.png) | [architecture.md](../architecture.md#deployment)           |
| NestJS module map          | [modules.mmd](modules.mmd)       | [kan-57-modules-diagram.png](../evidence/kan-57-modules-diagram.png)       | [architecture.md](../architecture.md#module-map)           |
| One request, step by step  | [lifecycle.mmd](lifecycle.mmd)   | [kan-57-lifecycle-diagram.png](../evidence/kan-57-lifecycle-diagram.png)   | [architecture.md](../architecture.md)                      |
| From receipt to PayNow     | [sequence.mmd](sequence.mmd)     | [kan-57-sequence-diagram.png](../evidence/kan-57-sequence-diagram.png)     | [architecture.md](../architecture.md)                      |
| CI/CD pipeline             | [pipeline.mmd](pipeline.mmd)     | [kan-51-pipeline-diagram.png](../evidence/kan-51-pipeline-diagram.png)     | [pipeline.md](../pipeline.md#stages)                       |
| Data model (all 10 tables) | [er.mmd](er.mmd)                 | [kan-51-er-diagram.png](../evidence/kan-51-er-diagram.png)                 | [data-model.md](../data-model.md#er-diagram)               |
| Timeline (Gantt)           | [gantt.mmd](gantt.mmd)           | [kan-60-gantt.png](../evidence/kan-60-gantt.png)                           | [sprint-3.md](../sprints/sprint-3.md#evidence), report 5.3 |

When the code changes, edit the `.mmd` file, copy it into the doc that shows it, and render the PNG again.
