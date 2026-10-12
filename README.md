# PR Inbox

English | [日本語](./README.ja.md)

Shows a given user's open PRs in the terminal as a stack tree, followed by a review status list in the same order. It never writes to GitHub.

## Requirements

- Node.js 24 or later
- GitHub CLI (`gh`), logged in with `gh auth login` using an account that can read the target repository

## Usage

```bash
npx pr-inbox [--repo OWNER/REPO] [--trunk BRANCH] YOUR_GITHUB_USERNAME
```

If installed with `npm install -g pr-inbox`, run it as `pr-inbox`.

Replace `YOUR_GITHUB_USERNAME` with the GitHub username to check. The username is required.

| Option    | Description                                                                |
| --------- | -------------------------------------------------------------------------- |
| `--repo`  | Target repository. Defaults to the git repository in the current directory |
| `--trunk` | Base branch. Defaults to the target repository's default branch            |

It exits with an error if the current directory is not a git repository and `--repo` is not given, or if the default branch cannot be determined and `--trunk` is not given.

While fetching, it prints progress, such as fetching the open PR list and the PR numbers being fetched, to standard error. The tree and the list go to standard output, so progress logs never mix into piped output.

## Output

`Stack` shows the parent-child relationships between PRs. It includes parent PRs by other authors, marked with `[parent]`. Titles are never truncated.

`PRs` is a list in the same order as the tree.

Only the PR numbers in the tree and the list get OSC 8 hyperlinks, so you can open PRs from supporting terminals. No link control sequences are added to piped output.

| Column      | Description                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR          | PR number                                                                                                                                                                                                                      |
| Title       | PR title                                                                                                                                                                                                                       |
| Base branch | Targets the base branch. The header shows the base branch name (such as `main`)                                                                                                                                                |
| Conflict    | Has conflicts with the base branch                                                                                                                                                                                             |
| Approved    | Approved by someone other than the author and bots, with no outstanding change requests                                                                                                                                        |
| Fixed       | Has a non-merge commit after the latest comment                                                                                                                                                                                |
| Commit      | Time since the latest non-merge commit                                                                                                                                                                                         |
| Comment     | Time since the latest comment                                                                                                                                                                                                  |
| Reviewer    | Requested reviewers and people who reviewed, deduplicated and sorted alphabetically. With multiple people, shows the first 5 characters of each name; with one person, the full name. Separated by `, `. `-` if there are none |

When names are abbreviated, `Reviewers` below the list shows a table mapping each abbreviation to the original names. If multiple names share an abbreviation, all of them are listed.

Values in the base branch, `Conflict`, `Approved`, and `Fixed` columns are right-aligned: `✓` if applicable, `-` if not, and `?` if unknown. `Conflict` also shows `?` while GitHub is still computing it. `Fixed` is `-` for PRs without comments. `Fixed` only compares timestamps; it does not judge the content of review comments or whether threads are resolved.

In supporting terminals, headings are bold, titles in the tree are dim, and the header row of the list is dim and bold. PRs that target the base branch, are approved, and are confirmed to have no conflicts have their number and title shown in bright green in the list. `✓` is green (red for `Conflict`), `-` is dim, and `?` is yellow. No ANSI colors are added to piped output. Colors can also be disabled with `NO_COLOR=1`.

Comments cover review bodies, thread replies, and general comments, excluding those by the author and bots. Commits exclude merge commits (commits with two or more parents) and are compared by commit date.

Times are right-aligned, like `10d`, `3h`, and `5m`, where `d` is days, `h` is hours, and `m` is minutes. Values are rounded down to the unit, and negative values indicate future timestamps. `-` if there is no timestamp.

When the fetched data is incomplete, items that cannot be determined are shown as `?`. If the reviewers cannot be determined, `Reviewer` shows `Unknown`. Fetch failures are shown as `Warning`. If there are 500 or more open PRs, it exits with an error because the merge order cannot be determined.

## Development

```bash
mise install
pnpm install
pnpm check
pnpm build
```

`pnpm check` runs format checking (`pnpm format:check`), lint (`pnpm lint`), type checking (`pnpm typecheck`), and tests (`pnpm test`). Format the code with `pnpm format`. Lint treats warnings as failures.

`pnpm build` outputs JavaScript to `dist/`. When publishing to npm, `prepublishOnly` runs `pnpm check` and `prepack` runs the build automatically, and only `dist/` is published.

For development, Node.js 26.11.1 specified in `mise.toml` can run the source directly by stripping TypeScript type annotations.

```bash
node index.mts [--repo OWNER/REPO] [--trunk BRANCH] YOUR_GITHUB_USERNAME
```

## License

[MIT](./LICENSE)
