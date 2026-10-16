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

`Stack` shows the parent-child relationships between PRs. It also includes parent PRs by other authors. Titles are displayed in full, without added labels.

`PRs` is a list in the same order as the tree. In both views, PRs by authors other than the selected user have `*` immediately after the PR number, such as `#12*`. When such PRs are present, a legend explains the marker above the tree. Usernames are compared case-insensitively. The marker uses the same green as added lines in supporting terminals and remains visible when colors are disabled or output is piped.

PR numbers in the tree and list link to their PRs, and reviewer names link to their GitHub accounts, using OSC 8 hyperlinks in supporting terminals. No link control sequences are added to piped output.

| Column      | Description                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR          | PR number                                                                                                                                                                                                                      |
| Title       | PR title; dimmed for draft PRs                                                                                                                                                                                                 |
| Diff        | Added and deleted lines (`+123 -456`); additions are green and deletions are red in supporting terminals                                                                                                                       |
| Base branch | Targets the base branch. The header shows the base branch name (such as `main`)                                                                                                                                                |
| Conflict    | Has conflicts with the base branch                                                                                                                                                                                             |
| Approved    | Approved by someone other than the author and bots, with no outstanding change requests                                                                                                                                        |
| Fixed       | Has a non-merge commit after the latest comment                                                                                                                                                                                |
| Commit      | Time since the latest non-merge commit                                                                                                                                                                                         |
| Comment     | Time since the latest comment                                                                                                                                                                                                  |
| Reviewer    | Requested reviewers and people who reviewed, deduplicated and sorted alphabetically. With multiple people, shows the first 5 characters of each name; with one person, the full name. Separated by `, `. `-` if there are none |

When names are abbreviated, `Reviewers` below the list shows a table mapping each abbreviation to the original names. If multiple names share an abbreviation, all of them are listed.

Values in the base branch, `Conflict`, `Approved`, and `Fixed` columns are right-aligned: `✓` if applicable, `-` if not, and `?` if unknown. If GitHub is still computing whether a PR has conflicts, it re-queries up to 3 times at 2-second intervals, and `Conflict` shows `?` if the result is still unavailable. `Fixed` is `-` for PRs without comments. `Fixed` only compares timestamps; it does not judge the content of review comments or whether threads are resolved.

In supporting terminals, headings are bold, titles in the tree are dim except for Ready PRs by other authors, and the header row of the list is dim and bold. Only PRs by the selected user that target the base branch, are approved, and are confirmed to have no conflicts have their number and non-draft title shown in bright green in the list. In both views, titles of PRs by other authors are dim for Drafts and use the normal terminal color for Ready PRs, even when approved and conflict-free. `✓` is green (red for `Conflict`), `-` is dim, and `?` is yellow. No ANSI colors are added to piped output. Colors can also be disabled with `NO_COLOR=1`.

Comments cover review bodies, thread replies, and general comments, excluding those by the author and bots. Commits exclude merge commits (commits with two or more parents) and are compared by commit date.

Times are right-aligned, like `10d`, `3h`, and `5m`. If the date has changed, it shows the difference in calendar days with `d`, so a commit from the previous day shows `1d` even if less than 24 hours have passed. On the same day, it shows the elapsed time in hours (`h`) or minutes (`m`), rounded down. Dates are determined in the local time zone. Negative values indicate future timestamps. `-` if there is no timestamp.

When the fetched data is incomplete, items that cannot be determined are shown as `?`. If the reviewers cannot be determined, `Reviewer` shows `Unknown`. Fetch failures are shown as `Warning`. If there are 500 or more open PRs, it exits with an error because the merge order cannot be determined.

## Development

```bash
mise install
pnpm install
pnpm check
pnpm build
```

`pnpm check` runs format checking (`pnpm format:check`), lint (`pnpm lint`), type checking (`pnpm typecheck`), and tests (`pnpm test`). Format the code with `pnpm format`. Lint treats warnings as failures. `Date` is forbidden by lint; use `Temporal` from `temporal-polyfill-lite` instead.

`pnpm build` outputs JavaScript to `dist/`. When publishing to npm, `prepublishOnly` runs `pnpm check` and `prepack` runs the build automatically, and only `dist/` is published.

For development, Node.js 26.11.1 specified in `mise.toml` can run the source directly by stripping TypeScript type annotations.

```bash
node index.mts [--repo OWNER/REPO] [--trunk BRANCH] YOUR_GITHUB_USERNAME
```

## License

[MIT](./LICENSE)
