import hyperon
import rdflib
import json

# from csv_to_metta import parse_metta


def jsonld_to_graph(f):
    g = rdflib.Graph()
    g.parse(f, format="json-ld")

    return g


def read_context(f):
    return extract_contexts(json.load(f))


def extract_contexts(node):
    """
    Collect all '@context' values present in a parsed JSON-LD document.
    Returns a single context when only one is present, otherwise a list of
    contexts (one for every object that defines its own '@context').
    """
    contexts = []

    def collect(n):
        if isinstance(n, dict):
            if '@context' in n:
                contexts.append(n['@context'])
            for value in n.values():
                collect(value)
        elif isinstance(n, list):
            for value in n:
                collect(value)

    collect(node)
    return contexts[0] if len(contexts) == 1 else contexts


def dict_to_str(d):
    match d:
        case dict():
            return '(' + ' '.join([f'({dict_to_str(k)} {dict_to_str(v)})' for k, v in d.items()]) + ')'
        case list():
            return '(' + ' '.join([f'({dict_to_str(k)} {dict_to_str(v)})' for k, v in enumerate(d)]) + ')'
        case _:
            return str(d)


def graph_to_mettastr(graph: rdflib.Graph, context=None) -> str:
    """
    take an RDFlib graph and convert straight away to MeTTa strings
    method almost the same as for nt translation
    only difference are the randomly labeled bnodes
    -> eventually merge them with both n3 and nt methods
    """
    string_dt = "http://www.w3.org/2001/XMLSchema#string"
    langstring_dt = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString"
    dirlangstring_dt = "http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString"

    trans = {rdflib.term.Literal: 'literal', rdflib.term.URIRef: 'uriref', rdflib.term.BNode: 'bnode',
             rdflib.term.Variable: 'variable'}

    def term_to_atom(t):
        match t:
            case rdflib.term.Literal(x):
                # when using x.value instead of str(x), dates like "1979-10-12" become "None"
                # not sure why, might be a bug in the library
                if x.language:
                    return f'((literal ({langstring_dt} {x.language})) "{str(x)}")'
                elif not x.language and not x.datatype:
                    return f'((literal ({string_dt})) "{str(x)}")'
                elif not x.language and x.datatype:
                    return f'((literal ({x.datatype})) "{str(x)}")'
            case rdflib.term.BNode(b):
                    return f'(bnode {b})'
            case x:
                return f'({trans[type(x)]} {x})'

    triples = '\n'.join(['(' + ' '.join([term_to_atom(t) for t in tup]) + ')' for tup in graph])

    context_atoms = []
    if context is not None:
        contexts = context if isinstance(context, list) else [context]
        context_atoms = [f'(context {dict_to_str(c)})' for c in contexts]

    parts = []
    if triples:
        parts.append(triples)
    parts.extend(context_atoms)
    return '\n'.join(parts)


def metta_context_to_dict(c: hyperon.Atom):
    # input is one context atom, e.g. ((name http://xmlns.com/foaf/0.1/name) (homepage ((@id http://xmlns.com/foaf/0.1/workplaceHomepage) (@type @id))) (Person http://xmlns.com/foaf/0.1/Person))
    # or a single string context, e.g. "https://json-ld.org/contexts/person.jsonld"
    match c:
        case hyperon.ExpressionAtom():
            return {atom_name(child.get_children()[0]): metta_context_to_dict(child.get_children()[1]) for child in
                    c.get_children()}
        case hyperon.SymbolAtom():
            return c.get_name()
        case hyperon.GroundedAtom() as ga:
            return ga.get_object().value
        case _:
            raise NotImplemented


def atom_name(a: hyperon.Atom):
    match a:
        case hyperon.GroundedAtom() as ga:
            return ga.get_object().value
        case hyperon.SymbolAtom() as sa:
            return sa.get_name()
        case _:
            raise NotImplementedError(type(a))


def metta_to_graph(m: hyperon.MeTTa) -> tuple[rdflib.Graph, dict]:
    atoms = [r for r in m.space().get_atoms() if isinstance(r, hyperon.ExpressionAtom)]
    context_atoms = [a for a in atoms
                     if a.get_children() and isinstance(a.get_children()[0], hyperon.SymbolAtom)
                     and a.get_children()[0].get_name() == "context"]
    if context_atoms:
        atoms = [a for a in atoms if a not in context_atoms]

    def atom_to_term(r):
        match r.get_children()[0]:
            case hyperon.SymbolAtom():
                match r.get_children()[0].get_name():
                    case "bnode":
                        return rdflib.term.BNode(r.get_children()[1].get_name())
                    case "variable":
                        return rdflib.term.Variable(r.get_children()[1].get_name())
                    case "uriref":
                        return rdflib.term.URIRef(r.get_children()[1].get_name())
            case hyperon.ExpressionAtom():
                literal_type = r.get_children()[0]
                literal_uri = literal_type.get_children()[1].get_children()[0].get_name()
                literal_name = r.get_children()[1].get_object().value
                assert literal_type.get_children()[0].get_name() == "literal"
                match literal_uri:
                    case "http://www.w3.org/2001/XMLSchema#string":
                        return rdflib.term.Literal(literal_name)
                    case "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString":
                        language = literal_type.get_children()[1].get_children()[1].get_name()
                        return rdflib.term.Literal(literal_name, lang=language)
                    case _:
                        return rdflib.term.Literal(literal_name, datatype=literal_uri)

    g = rdflib.Graph()
    for a in atoms:
        subj = a.get_children()[0]
        prop = a.get_children()[1]
        obj = a.get_children()[2]
        g.add((atom_to_term(subj), atom_to_term(prop), atom_to_term(obj)))

    contexts = [metta_context_to_dict(a.get_children()[1]) for a in context_atoms]
    if len(contexts) == 1:
        context = contexts[0]
    elif contexts:
        context = contexts
    else:
        context = None

    return g, context

